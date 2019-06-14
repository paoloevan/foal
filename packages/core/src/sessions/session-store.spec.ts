// std
import { deepStrictEqual, strictEqual } from 'assert';

// FoalTS
import { SESSION_DEFAULT_ABSOLUTE_TIMEOUT, SESSION_DEFAULT_INACTIVITY_TIMEOUT } from './constants';
import { Session } from './session';
import { SessionStore } from './session-store';

describe('SessionStore', () => {

  describe('has a "getExpirationTimeouts" method that', () => {

    afterEach(() => {
      delete process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_INACTIVITY;
      delete process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_ABSOLUTE;
    });

    it('should return the session expiration timeouts from the configuration.', () => {
      const timeouts = SessionStore.getExpirationTimeouts();
      deepStrictEqual(timeouts, {
        absolute: SESSION_DEFAULT_ABSOLUTE_TIMEOUT,
        inactivity: SESSION_DEFAULT_INACTIVITY_TIMEOUT,
      });
    });

    it('should return the default session expiration timeouts if none is set in the configuration.', () => {
      process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_ABSOLUTE = (SESSION_DEFAULT_ABSOLUTE_TIMEOUT + 1).toString();
      process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_INACTIVITY = (SESSION_DEFAULT_INACTIVITY_TIMEOUT + 2).toString();

      const timeouts = SessionStore.getExpirationTimeouts();
      deepStrictEqual(timeouts, {
        absolute: SESSION_DEFAULT_ABSOLUTE_TIMEOUT + 1,
        inactivity: SESSION_DEFAULT_INACTIVITY_TIMEOUT + 2,
      });
    });

    it('should throw if settings.session.expirationTimeouts.inactivity is negative.', () => {
      process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_INACTIVITY = '-1';
      try {
        SessionStore.getExpirationTimeouts();
        throw new Error('An error should have been thrown.');
      } catch (error) {
        strictEqual(
          error.message,
          '[CONFIG] The value of settings.session.expirationTimeouts.inactivity must be a positive number.'
        );
      }
    });

    it('should throw if settings.session.expirationTimeouts.absolute is negative.', () => {
      process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_ABSOLUTE = '-1';
      try {
        SessionStore.getExpirationTimeouts();
        throw new Error('An error should have been thrown.');
      } catch (error) {
        strictEqual(
          error.message,
          '[CONFIG] The value of settings.session.expirationTimeouts.absolute must be a positive number.'
        );
      }
    });

    it('should throw if settings.session.expirationTimeouts.absolute is smaller than the inactivity one.', () => {
      process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_ABSOLUTE = '1';
      process.env.SETTINGS_SESSION_EXPIRATION_TIMEOUTS_INACTIVTY = '2';
      try {
        SessionStore.getExpirationTimeouts();
        throw new Error('An error should have been thrown.');
      } catch (error) {
        strictEqual(
          error.message,
          '[CONFIG] The value of settings.session.expirationTimeouts.absolute must be greater than *.inactivity.'
        );
      }
    });

  });

  describe('has a "generateID" method that', () => {

    it('should generate a random base64url-encoded string which size is 128 bits.', async () => {
      class Store extends SessionStore {
        createAndSaveSession(sessionContent: object): Promise<Session> {
          throw new Error('Method not implemented.');
        }
        update(session: Session): Promise<void> {
          throw new Error('Method not implemented.');
        }
        destroy(sessionID: string): Promise<void> {
          throw new Error('Method not implemented.');
        }
        read(sessionID: string): Promise<Session | undefined> {
          throw new Error('Method not implemented.');
        }
        extendLifeTime(sessionID: string): Promise<void> {
          throw new Error('Method not implemented.');
        }
        clear(): Promise<void> {
          throw new Error('Method not implemented.');
        }
        cleanUpExpiredSessions(): Promise<void> {
          throw new Error('Method not implemented.');
        }

        getID(): Promise<string> {
          return this.generateSessionID();
        }
      }

      const id = await new Store().getID();
      const buffer = Buffer.from(id, 'base64');
      strictEqual(buffer.length, 32);
      strictEqual(id.includes('='), false);

      // The below tests are bad because the ID is different each time this test is ran.
      strictEqual(id.includes('+'), false);
      strictEqual(id.includes('/'), false);
    });

  });

  describe('has a "createAndSaveSessionFromUser" method that', () => {

    it('should call "createAndSaveSession" with the user ID and return the created session.', async () => {
      class Store extends SessionStore {
        async createAndSaveSession(sessionContent: object): Promise<Session> {
          return new Session('xxx', sessionContent, 36);
        }
        update(session: Session): Promise<void> {
          throw new Error('Method not implemented.');
        }
        destroy(sessionID: string): Promise<void> {
          throw new Error('Method not implemented.');
        }
        read(sessionID: string): Promise<Session | undefined> {
          throw new Error('Method not implemented.');
        }
        extendLifeTime(sessionID: string): Promise<void> {
          throw new Error('Method not implemented.');
        }
        clear(): Promise<void> {
          throw new Error('Method not implemented.');
        }
        cleanUpExpiredSessions(): Promise<void> {
          throw new Error('Method not implemented.');
        }

      }

      const user = { id: 1 };

      const session = await new Store().createAndSaveSessionFromUser(user);

      strictEqual(session.sessionID, 'xxx');
      deepStrictEqual(session.getContent(), { userId: 1 });
      strictEqual(session.createdAt, 36);
    });

  });

});
