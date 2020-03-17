/* eslint-env node, jasmine */

// Utils
import {
  getTrackObjectFromHGC,
  waitForTilesLoaded
} from '../app/scripts/utils';

import FetchMockHelper from './utils/FetchMockHelper';

import createElementAndApi from './utils/create-element-and-api';
import removeDiv from './utils/remove-div';

import horizontal1dLineTrackWithConstViewConf from './view-configs/horizontal-1d-line-track-with-const';
import { horizontalLineEnd } from './view-configs';

describe('Simple HiGlassComponent', () => {
  let hgc = null;
  let api = null;
  let div = null;
  let viewConf;
  const fetchMockHelper = new FetchMockHelper(
    horizontal1dLineTrackWithConstViewConf,
    'Horizontal1DTrackTest'
  );

  beforeAll(async () => {
    await fetchMockHelper.activateFetchMock();
  });

  describe('Horizontal1DLineTrack with const indicator', () => {
    it('check that the const indicators were rendered', done => {
      viewConf = horizontal1dLineTrackWithConstViewConf;

      [div, api] = createElementAndApi(viewConf, { bound: true });

      hgc = api.getComponent();

      const trackObj = getTrackObjectFromHGC(
        hgc,
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[0].uid
      );

      waitForTilesLoaded(hgc, () => {
        expect(trackObj.constIndicator.children.length).toEqual(3);
        done();
      });
    });

    afterEach(() => {
      if (api && api.destroy) api.destroy();
      if (div) removeDiv(div);
      api = undefined;
      div = undefined;
    });
  });

  describe('Horizontal1DLineTrack with const indicator', () => {
    it('check that the const indicators were rendered', done => {
      viewConf = horizontalLineEnd;

      [div, api] = createElementAndApi(viewConf, { bound: true });

      hgc = api.getComponent();

      const trackObj = getTrackObjectFromHGC(
        hgc,
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[1].uid
      );

      const trackObjGeneAnnotations = getTrackObjectFromHGC(
        hgc,
        viewConf.views[0].uid,
        viewConf.views[0].tracks.top[2].uid
      );

      waitForTilesLoaded(hgc, () => {
        // this should be
        expect(trackObj.getDataAtPos(366)).not.toEqual(null);

        // should be beyond the end of the data array because
        // it's past the end of the last tile
        expect(trackObj.getDataAtPos(366)).toEqual(undefined);

        // gene annotations don't currently have a mouseover function
        expect(trackObjGeneAnnotations.getDataAtPos(10)).toEqual(null);
        done();
      });
    });

    afterEach(() => {
      if (api && api.destroy) api.destroy();
      if (div) removeDiv(div);
      api = undefined;
      div = undefined;
    });
  });

  afterAll(async () => {
    await fetchMockHelper.storeDataAndResetFetchMock();
  });
});
