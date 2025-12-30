/**
 * Microsoft Graph API 认证模块
 * 支持设备代码流（Device Code Flow）认证
 */

import * as msal from '@azure/msal-node';
import * as fs from 'fs';
import * as path from 'path';
import { settings } from '../config/index.js';

const TOKEN_CACHE_FILE = '.token_cache.json';

export interface AuthResult {
  accessToken: string;
  expiresOn: Date | null;
}

export class GraphAuthenticator {
  private msalClient: msal.PublicClientApplication;
  private tokenCache: msal.TokenCache;
  private cacheFilePath: string;

  constructor(
    clientId?: string,
    tenantId?: string,
    cacheFile?: string
  ) {
    const config: msal.Configuration = {
      auth: {
        clientId: clientId || settings.azure.clientId,
        authority: `https://login.microsoftonline.com/${tenantId || settings.azure.tenantId}`,
      },
      cache: {
        cachePlugin: this.createCachePlugin(),
      },
    };

    if (!config.auth.clientId) {
      throw new Error('缺少 AZURE_CLIENT_ID 配置');
    }

    this.cacheFilePath = cacheFile || TOKEN_CACHE_FILE;
    this.msalClient = new msal.PublicClientApplication(config);
    this.tokenCache = this.msalClient.getTokenCache();
  }

  /**
   * 创建缓存插件，用于持久化 Token
   */
  private createCachePlugin(): msal.ICachePlugin {
    const cacheFile = this.cacheFilePath || TOKEN_CACHE_FILE;
    
    return {
      beforeCacheAccess: async (cacheContext: msal.TokenCacheContext) => {
        if (fs.existsSync(cacheFile)) {
          try {
            const cacheData = fs.readFileSync(cacheFile, 'utf-8');
            cacheContext.tokenCache.deserialize(cacheData);
          } catch (error) {
            console.warn('⚠️ 读取 Token 缓存失败，将重新认证');
          }
        }
      },
      afterCacheAccess: async (cacheContext: msal.TokenCacheContext) => {
        if (cacheContext.cacheHasChanged) {
          try {
            fs.writeFileSync(cacheFile, cacheContext.tokenCache.serialize());
          } catch (error) {
            console.warn('⚠️ 保存 Token 缓存失败');
          }
        }
      },
    };
  }

  /**
   * 获取 Access Token
   */
  async getAccessToken(): Promise<string> {
    const scopes = settings.azure.scopes;

    // 1. 尝试从缓存获取
    const accounts = await this.msalClient.getTokenCache().getAllAccounts();
    
    if (accounts.length > 0) {
      try {
        const silentRequest: msal.SilentFlowRequest = {
          account: accounts[0],
          scopes,
        };
        const response = await this.msalClient.acquireTokenSilent(silentRequest);
        if (response?.accessToken) {
          return response.accessToken;
        }
      } catch (error) {
        // 静默获取失败，继续使用设备代码流
      }
    }

    // 2. 使用设备代码流
    return this.deviceCodeFlow(scopes);
  }

  /**
   * 设备代码流认证
   */
  private async deviceCodeFlow(scopes: string[]): Promise<string> {
    const deviceCodeRequest: msal.DeviceCodeRequest = {
      scopes,
      deviceCodeCallback: (response) => {
        console.log('\n' + '='.repeat(60));
        console.log('📱 请完成 Microsoft 登录:');
        console.log(`   1. 打开浏览器访问: ${response.verificationUri}`);
        console.log(`   2. 输入代码: ${response.userCode}`);
        console.log('='.repeat(60) + '\n');
      },
    };

    try {
      const response = await this.msalClient.acquireTokenByDeviceCode(deviceCodeRequest);
      if (response?.accessToken) {
        console.log('✅ 登录成功！\n');
        return response.accessToken;
      }
      throw new Error('未获取到 Access Token');
    } catch (error) {
      throw new Error(`认证失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取带认证信息的请求头
   */
  async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 测试 API 连接
   */
  async testConnection(): Promise<boolean> {
    try {
      const headers = await this.getHeaders();
      const response = await fetch(`${settings.azure.graphEndpoint}/me`, {
        headers,
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 清除缓存，强制重新登录
   */
  clearCache(): void {
    if (fs.existsSync(this.cacheFilePath)) {
      fs.unlinkSync(this.cacheFilePath);
      console.log('🗑️ Token 缓存已清除');
    }
  }
}

/**
 * 获取 Graph API 认证客户端的便捷函数
 */
export function getGraphClient(): GraphAuthenticator {
  return new GraphAuthenticator();
}

