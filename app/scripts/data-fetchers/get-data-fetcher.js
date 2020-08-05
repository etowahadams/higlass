import GBKDataFetcher from './genbank-fetcher';
import LocalDataFetcher from './local-tile-fetcher';
import DataFetcher from '../DataFetcher';

const getDataFetcher = (dataConfig, pubSub, pluginDataFetchers) => {
  // Check if a plugin data fetcher is available.
  const pluginDataFetcher = pluginDataFetchers[dataConfig.type];
  if (pluginDataFetcher) {
    // eslint-disable-next-line new-cap
    return new pluginDataFetcher(dataConfig, pubSub);
  }

  if (dataConfig.type === 'genbank') {
    return new GBKDataFetcher(dataConfig, pubSub);
  }

  if (dataConfig.type === 'local-tiles') {
    return new LocalDataFetcher(dataConfig, pubSub);
  }

  return new DataFetcher(dataConfig, pubSub);
};

export default getDataFetcher;
