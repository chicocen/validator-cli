import {configType} from '../config/default-network-config';
import axios, {AxiosError} from 'axios';
import {BN} from 'ethereumjs-util';
import {ProcessDescription} from 'pm2';
import {Pm2ProcessStatus, statusFromPM2} from '../pm2';
import fs from 'fs';
import path from 'path';
import tcache from './tcache';
import {File} from '../utils';

export const cache = new tcache();
export const networkAccount = '0'.repeat(64);
let savedActiveNode:
  | {
      id: string;
      ip: string;
      port: string;
      publicKey: string;
    }
  | undefined = undefined;

/**
 * Checks if active node is already defined or present in file. Returns true
 * If active node is not available, returns false
 * denoting that new node needs to be fetched
 *
 * @returns {boolean} True if active node is already defined, false if not
 */
function readActiveNode(): boolean {
  // Check if savedActiveNode is already defined
  if (savedActiveNode !== undefined) {
    return true;
  } else {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const data = fs.readFileSync(
        path.join(__dirname, `../../${File.ACTIVE_NODE}`),
        'utf8'
      );
      savedActiveNode = JSON.parse(data);

      return true;
    } catch (e) {
      return false;
    }
  }
}

async function fetchDataFromNetwork(
  config: configType,
  query: string,
  callback: (response: {[id: string]: string} | null) => boolean
) {
  let retries = 3;
  if (!readActiveNode()) {
    await getNewActiveNode(config);
  }

  if (!savedActiveNode) {
    throw new Error('Unable to fetch active node');
  }

  let data = {data: null, status: 500};
  do {
    try {
      await getNewActiveNode(config);
    } catch (e) {
      continue;
    }

    // `savedActiveNode` may mutate between loop iterations, so `url` must be
    // set for each loop iteration
    const url = `http://${savedActiveNode.ip}:${savedActiveNode.port}` + query;

    try {
      data = await axios.get(url, {timeout: 2000});
    } catch (e) {
      if (e instanceof AxiosError) {
        if (e.response) {
          console.error(`Error occurred with status ${e.response.status}:`, e.response);
        } else if (e.request) {
          console.error('No response received:', e.request);
        } else {
          console.error('Error setting up request:', e.message);
        }
      }

      // set data to null and status to 500 to indicate that the request failed
      data = {data: null, status: 500};
    }
  } while ((data.status === 500 || callback(data.data)) && retries--);

  if (retries <= 0) {
    throw new Error('Unable to fetch data from network (out of retries).');
  } else {
    return data.data;
  }
}

/**
 * Fetches a new random active node from the network.
 * Saves to file by overwriting the previous active node.
 * Also saves the active node to a global variable.
 *
 * @param config
 * @returns {Promise<void>}
 * @throws {Error} If unable to fetch list of nodes in the network
 */
export async function getNewActiveNode(config: configType): Promise<void> {
  const randomArchiver =
    config.server.p2p.existingArchivers[
      Math.floor(Math.random() * config.server.p2p.existingArchivers.length)
    ];
  const archiverUrl = `http://${randomArchiver.ip}:${randomArchiver.port}/nodelist`;
  const nodeList = await axios
    .get(archiverUrl, {timeout: 2000})
    .then(res => res.data)
    .catch(err => console.error(err));
  if (!nodeList?.nodeList) {
    throw new Error('Unable to fetch list of nodes in the network');
  }
  savedActiveNode =
    nodeList.nodeList[Math.floor(Math.random() * nodeList.nodeList.length)];

  //Write savedActiveNode to file
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  fs.writeFileSync(
    path.join(__dirname, `../../${File.ACTIVE_NODE}`),
    JSON.stringify(savedActiveNode)
  );
}

export async function fetchInitialParameters(config: configType) {
  const value = cache.get('initialParameters');

  if (value) {
    const parsedValue = JSON.parse(value);
    return {
      nodeRewardAmount: new BN(parsedValue.nodeRewardAmount, 16),
      nodeRewardInterval: new BN(parsedValue.nodeRewardInterval, 16),
    };
  }

  const initialParams = await fetchDataFromNetwork(
    config,
    `/account/${networkAccount}?type=5`,
    data => data?.account == null
  );

  const response = initialParams?.account?.data?.current;
  if (!response) {
    throw new Error("Fetched initial parameters, but account data isn't found");
  }
  const nodeRewardAmount = new BN(response.nodeRewardAmountUsd, 16);
  const nodeRewardInterval = new BN(response.nodeRewardInterval);

  const cycleDuration = await fetchCycleDuration(config);
  cache.set(
    'initialParameters',
    JSON.stringify({nodeRewardAmount, nodeRewardInterval}),
    cycleDuration * 1000
  );
  return {nodeRewardAmount, nodeRewardInterval};
}

async function fetchNodeParameters(config: configType, nodePubKey: string) {
  const nodeParams = await fetchDataFromNetwork(
    config,
    `/account/${nodePubKey}?type=9`,
    data => data?.account == null
  );

  return nodeParams?.account?.data ?? nodeParams?.account;
}

async function fetchNodeLoad(config: configType) {
  const url = `http://localhost:${config.server.ip.externalPort}/load`;
  const nodeLoad = await axios.get(url);

  if (nodeLoad?.data == null) {
    throw new Error(
      'Node not active in the network. Unable to fetch node load'
    );
  }
  return nodeLoad.data;
}

async function fetchNodeTxStats(config: configType) {
  const url = `http://localhost:${config.server.ip.externalPort}/tx-stats`;
  const txStats = await axios.get(url);

  if (txStats?.data == null) {
    throw new Error(
      'Node not active in the network. Unable to fetch node tx-stats'
    );
  }
  return txStats.data;
}

/**
 *
 * @param config node config to get url and port
 * @throws {AxiosError} Status 404. If unable to fetch node-info
 * @returns nodeInfo
 */
export async function fetchNodeInfo(config: configType) {
  const url = `http://localhost:${config.server.ip.externalPort}/nodeinfo?reportIntermediateStatus=true`;
  const response = await axios.get(url, { timeout: 2000 });
  const nodeInfo = response.data;

  return nodeInfo.nodeInfo;
}

async function fetchNetworkStats(config: configType) {
  const networkStats = await fetchDataFromNetwork(
    config,
    '/network-stats',
    data => data == null
  );

  if (networkStats == null) {
    throw new Error('Unable to fetch network-stats');
  }
  return networkStats;
}

export async function getNetworkParams(
  config: configType,
  description: ProcessDescription
) {
  try {
    const networkStats = await fetchNetworkStats(config);
    let result = {...networkStats};

    // Check if description is undefined
    if (!description) {
      return result;
    }

    const status: Pm2ProcessStatus = statusFromPM2(description);
    if (status?.status && status.status !== 'stopped') {
      const nodeLoad = await fetchNodeLoad(config);
      const nodeTxStats = await fetchNodeTxStats(config);
      result = {...result, ...nodeLoad, ...nodeTxStats};
    }
    return result;
  } catch (e) {
    console.error(e);
  }
}

export async function fetchEOADetails(config: configType, eoaAddress: string) {
  const eoaParams = await fetchDataFromNetwork(
    config,
    `/account/${eoaAddress}`,
    data => data?.account == null
  );

  return eoaParams?.account;
}

export async function fetchValidatorVersions(config: configType) {
  const validatorVersions = await fetchDataFromNetwork(
    config,
    '/nodeinfo',
    data => data == null
  );

  return validatorVersions.nodeInfo.appData;
}

export async function getAccountInfoParams(
  config: configType,
  nodePubKey: string
) {
  const params = {
    lockedStake: '',
    nominator: '',
    accumulatedRewards: new BN(0),
  };
  if (nodePubKey === '') {
    // Public key not found. This can happen in the primitive case when
    // the node has not been started for the first time.
    return params;
  }

  // prettier-ignore
  const {
    nodeRewardAmount,
    nodeRewardInterval
  } = await fetchInitialParameters(config);

  let nodeActiveDuration, previousRewards;

  try {
    const nodeData = await fetchNodeParameters(config, nodePubKey);
    if (!nodeData) {
      return params;
    }

    params.lockedStake = new BN(nodeData.stakeLock, 16).toString();
    previousRewards = new BN(nodeData.reward, 16);
    const startTime = nodeData.rewardStartTime * 1000;
    const endTime = nodeData.rewardEndTime * 1000;

    if (startTime > 0 && endTime === 0) {
      // Node is earning rewards
      nodeActiveDuration = Date.now() - startTime;
    } else if (startTime > 0 && endTime > 0) {
      // Node has earned rewards but is in standby
      nodeActiveDuration = endTime - startTime;
    } else if (startTime === 0 && endTime === 0) {
      // Node has not earned rewards and is in standby
      nodeActiveDuration = 0;
    } else {
      nodeActiveDuration = 0;
    }
    params.nominator = nodeData.nominator;
  } catch (err) {
    params.lockedStake = new BN(0).toString();
    nodeActiveDuration = 0;
    params.nominator = '';
    previousRewards = new BN(0);
  }

  const totalReward = nodeRewardAmount.mul(new BN(nodeActiveDuration));
  params.accumulatedRewards = previousRewards.add(
    totalReward.div(nodeRewardInterval)
  );

  return params;
}

export async function fetchStakeParameters(config: configType) {
  const value = cache.get('stakeParams');
  if (value) {
    return {
      stakeRequired: value,
    };
  }

  const stakeParams = await fetchDataFromNetwork(
    config,
    '/stake',
    data => !data
  );
  if (!stakeParams) {
    throw new Error("Couldn't fetch stake parameters");
  }

  const stakeRequired = new BN(stakeParams.stakeRequired, 16).toString();
  const cycleDuration = await fetchCycleDuration(config);
  cache.set('stakeParams', stakeRequired, cycleDuration * 1000);
  return {
    stakeRequired,
  };
}

export async function fetchCycleDuration(config: configType) {
  const latestCycle = await fetchDataFromNetwork(
    config,
    '/sync-newest-cycle',
    data => !data
  );
  if (!latestCycle) {
    throw new Error("Couldn't fetch latest cycle");
  }

  return latestCycle.newestCycle.duration;
}
