export const defaultNetworkConfig = {
  server: {
    baseDir: '.',
    p2p: {
      existingArchivers: [
        {
          ip: '3.127.57.166',
          port: 4000,
          publicKey:
            '758b1c119412298802cd28dbfa394cdfeecc4074492d60844cc192d632d84de3',
        },
        {
          ip: '139.144.189.238',
          port: 4000,
          publicKey:
            '840e7b59a95d3c5f5044f4bc62ab9fa94bc107d391001141410983502e3cde63',
        },
        {
          ip: '194.195.220.150',
          port: 4000,
          publicKey:
            '616f720f4b6145373acd95b068cb674ff3a24ba738cfff5da568ec36873859f6',
        },
        {
          ip: '45.79.113.106',
          port: 4000,
          publicKey:
            '7af699dd711074eb96a8d1103e32b589e511613ebb0c6a789a9e8791b2b05f34',
        },
      ],
    },
    ip: {
      externalIp: '127.0.0.1',
      externalPort: 9001,
      internalIp: '127.0.0.1',
      internalPort: 10001,
    },
    reporting: {
      report: true,
      recipient: 'http://localhost:3000/api',
      interval: 2,
      console: false,
    },
  },
};

export type networkConfigType = typeof defaultNetworkConfig;

export const networkConfigSchema = {
  type: "object",
  properties: {
    server: {
      type: "object",
      properties: {
        baseDir: {
          type: "string"
        },
        p2p: {
          type: "object",
          properties: {
            existingArchivers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ip: {
                    type: "string",
                  },
                  port: {
                    type: "integer",
                    minimum: 1024,
                    maximum: 65535
                  },
                  publicKey: {
                    type: "string"
                  }
                },
                required: ["ip", "port", "publicKey"]
              }
            }
          },
          required: ["existingArchivers"]
        },
        ip: {
          type: "object",
          properties: {
            externalIp: {
              type: "string",
            },
            externalPort: {
              type: "integer",
              minimum: 1024,
              maximum: 65535
            },
            internalIp: {
              type: "string",
            },
            internalPort: {
              type: "integer",
              minimum: 1024,
              maximum: 65535
            }
          },
          required: ["externalIp", "externalPort", "internalIp", "internalPort"]
        },
        reporting: {
          type: "object",
          properties: {
            report: {
              type: "boolean"
            },
            recipient: {
              type: "string",
            },
            interval: {
              type: "integer",
              minimum: 1
            },
            console: {
              type: "boolean"
            }
          },
          required: ["report", "recipient", "interval", "console"]
        }
      },
      required: ["baseDir", "p2p", "ip", "reporting"]
    }
  },
  required: ["server"],
};

export type nodeProgressType = {
  nodeInfo: {
    id: string;
    publicKey: string;
    curvePublicKay: string;
    externalIP: string;
    internalIP: string;
    externalPort: number;
    internalPort: number;
    status: string;
  };
  lastRotationIndex: {
    idx: number;
    total: number;
  };
  activeNodes: number;
  lastActiveTime: number;
  totalActiveTime: number;
};
