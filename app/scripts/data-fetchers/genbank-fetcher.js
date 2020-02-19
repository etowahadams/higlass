import slugid from 'slugid';
import pako from 'pako';
import genbankParser from 'genbank-parser';

/**
 * Take a list of genes, which can be any list with elements containing
 * { start, end } fields and return another list of { start, end }
 * fields containing the collapsed genes.
 *
 * The segments should be sorted by their start coordinate.
 *
 * The scale parameter is the number of base pairs per pixels
 */
function collapse(segments, scale) {
  const collapsed = [];

  // the maximum distance we allow between segments before collapsing them
  const MAX_DIST_BETWEEN = 5;

  // no segments in, no segments out
  if (!segments.length) {
    return [];
  }

  // start with the first segment
  let currStart = segments[0].start;
  let currEnd = segments[0].end;

  // continue on to the next segments
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].start < currEnd + (MAX_DIST_BETWEEN * 1) / scale) {
      // this segment is within merging distance -- merge it
      currEnd = Math.max(currEnd, segments[i].end);
    } else {
      // this segment is outside of the merging distance, dump the current
      // collapsed segment and start a new one
      collapsed.push({
        type: 'filler',
        start: currStart,
        end: currEnd
      });

      // start a new collapsed segment
      currStart = segments[i].start;
      currEnd = segments[i].end;
    }
  }

  // add the final segment
  collapsed.push({
    start: currStart,
    end: currEnd,
    type: 'filler'
  });

  return collapsed;
}

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}

function gbToHgGene(gb) {
  const importance = gb.end - gb.start;
  const strand = gb.strand === 1 ? '+' : '-';
  const uid = slugid.nice();

  if (gb.type === 'filler') {
    // this is annotation that was generated by collapsing genes and is
    // only meant to show that there is something there.
    return {
      xStart: gb.start,
      xEnd: gb.end,
      strand: gb.strand,
      fields: [],
      type: 'filler',
      uid
    };
  }

  return {
    xStart: gb.start,
    xEnd: gb.end,
    strand,
    chrOffset: 0,
    importance: gb.end - gb.start,
    uid,
    type: gb.type,
    fields: [
      'chrom',
      gb.start,
      gb.end,
      gb.name,
      importance,
      strand,
      '',
      '',
      gb.type,
      gb.name,
      gb.start.toString(),
      gb.end.toString(),
      gb.start.toString(),
      gb.end.toString()
    ]
  };
}

class GBKDataFetcher {
  constructor(dataConfig) {
    this.dataConfig = dataConfig;
    this.trackUid = slugid.nice();

    const extension = dataConfig.url.slice(dataConfig.url.length - 3);
    const gzipped = extension === '.gz';
    this.errorTxt = '';

    this.dataPromise = fetch(dataConfig.url, {
      mode: 'cors',
      redirect: 'follow',
      method: 'GET'
    })
      .then(response => (gzipped ? response.arrayBuffer() : response.text()))
      .then(buffer => {
        const gffText = gzipped
          ? pako.inflate(buffer, { to: 'string' })
          : buffer;
        this.gbJson = genbankParser(gffText);
        this.cdss = shuffle(
          this.gbJson[0].features.sort((a, b) => a.start - b.start)
        );
      });
  }

  tilesetInfo(callback) {
    this.tilesetInfoLoading = true;

    return this.dataPromise
      .then(() => {
        this.tilesetInfoLoading = false;

        const TILE_SIZE = 1024;
        let retVal = {};
        // retVal[this.trackUid] = {
        retVal = {
          tile_size: TILE_SIZE,
          max_zoom: Math.ceil(
            Math.log(this.gbJson[0].size / TILE_SIZE) / Math.log(2)
          ),
          max_width: this.gbJson[0].size,
          min_pos: [0],
          max_pos: [this.gbJson[0].size]
        };

        if (callback) {
          callback(retVal);
        }

        return retVal;
      })
      .catch(err => {
        this.tilesetInfoLoading = false;

        if (callback) {
          callback({
            error: `Error parsing genbank: ${err}`
          });
        }
      });
  }

  fetchTilesDebounced(receivedTiles, tileIds) {
    const tiles = {};

    const validTileIds = [];
    const tilePromises = [];

    for (const tileId of tileIds) {
      const parts = tileId.split('.');
      const z = parseInt(parts[0], 10);
      const x = parseInt(parts[1], 10);

      if (Number.isNaN(x) || Number.isNaN(z)) {
        console.warn('Invalid tile zoom or position:', z, x);
        continue;
      }

      validTileIds.push(tileId);
      tilePromises.push(this.tile(z, x));
    }

    Promise.all(tilePromises).then(values => {
      for (let i = 0; i < values.length; i++) {
        const validTileId = validTileIds[i];
        tiles[validTileId] = values[i];
        tiles[validTileId].tilePositionId = validTileId;
      }

      receivedTiles(tiles);
    });
    // tiles = tileResponseToData(tiles, null, tileIds);
    return tiles;
  }

  tile(z, x) {
    return this.tilesetInfo().then(tsInfo => {
      const tileWidth = +tsInfo.max_width / 2 ** +z;

      // get the bounds of the tile
      const minX = tsInfo.min_pos[0] + x * tileWidth;
      const maxX = tsInfo.min_pos[0] + (x + 1) * tileWidth;

      const filtered = this.cdss.filter(v => v.end > minX && v.start < maxX);
      const scaleFactor = 1024 / 2 ** (tsInfo.max_zoom - z);

      const collapsedPlus = collapse(
        filtered.filter(v => v.strand === 1),
        scaleFactor
      );
      const collapsedMinus = collapse(
        filtered.filter(v => v.strand !== 1),
        scaleFactor
      );

      collapsedPlus.forEach(v => {
        v.strand = '+';
      });
      collapsedMinus.forEach(v => {
        v.strand = '-';
      });

      let values = [];
      const TILE_CAPACITY = 20;
      // fill the tile with entries that are within it
      for (let i = 0; i < this.cdss.length; i++) {
        if (values.length >= TILE_CAPACITY) break;

        if (this.cdss[i].end >= minX && this.cdss[i].start <= maxX) {
          values.push(this.cdss[i]);
        }
      }

      values = [...values, ...collapsedPlus, ...collapsedMinus];
      // values = values.concat(collapsedPlus).concat(collapsedMinus);
      // we're not going to take into account importance
      return values.map(v => gbToHgGene(v));
    });
  }
}

export default GBKDataFetcher;
