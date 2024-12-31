import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {},
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'twit_db'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      config: {
        platforms: ['darwin']
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {}
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {}
    }
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'dist/main/index.js',
          config: 'vite.config.ts'
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.config.ts'
        }
      ]
    })
  ]
};

export default config; 