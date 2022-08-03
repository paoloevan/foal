// 3p
import axios from 'axios';

// FoalTS
import { AbstractProvider, SocialTokens } from './abstract-provider.service';
import { UserInfoError } from './user-info.error';

export interface TwitterAuthParameter {
}

/**
 * Twitter social provider.
 *
 * @export
 * @class TwitterProvider
 * @extends {AbstractProvider<TwitterAuthParameter, never>}
 */
export class TwitterProvider extends AbstractProvider<TwitterAuthParameter, never> {
  protected configPaths = {
    clientId: 'settings.social.twitter.clientId',
    clientSecret: 'settings.social.twitter.clientSecret',
    redirectUri: 'settings.social.twitter.redirectUri'
  };
  protected authEndpoint = 'https://twitter.com/i/oauth2/authorize';
  protected tokenEndpoint = 'https://api.twitter.com/2/oauth2/token';
  protected userInfoEndpoint = 'https://api.twitter.com/2/users/me';

  protected usePKCE: boolean = true;
  protected useAuthorizationHeaderForTokenEndpoint = true;

  protected defaultScopes: string[] = [ 'users.read', 'tweet.read' ];

  async getUserInfoFromTokens(tokens: SocialTokens) {
    try {
      const response = await axios.get(this.userInfoEndpoint, {
        headers: { Authorization: `${tokens.token_type} ${tokens.access_token}` }
      });
      return response.data;
    } catch (error: any) {
      throw new UserInfoError(error.response.data);
    }
  }
}
