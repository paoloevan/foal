import { Session, SessionOptions, SessionStore } from '@foal/core';
import {  Column, Entity, getRepository, LessThan, PrimaryColumn } from 'typeorm';

@Entity()
export class DatabaseSession {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  userId: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'bigint' })
  updatedAt: number;

  @Column({ type: 'bigint' })
  createdAt: number;
}

/**
 * TypeORM store.
 *
 * @export
 * @class TypeORMStore
 * @extends {SessionStore}
 */
export class TypeORMStore extends SessionStore {
  async createAndSaveSession(sessionContent: object, options: SessionOptions = {}): Promise<Session> {
    if (typeof options.userId === 'string') {
      throw new Error('[TypeORMStore] Impossible to save the session. The user ID must be a number.');
    }

    const sessionID = await this.generateSessionID();
    await this.applySessionOptions(sessionContent, options);

    const date = Date.now();

    // TODO: test that the method throws if the ID is already taken.
    await getRepository(DatabaseSession)
      .createQueryBuilder()
      .insert()
      .values({
        content: JSON.stringify(sessionContent),
        createdAt: date,
        id: sessionID,
        updatedAt: date,
        userId: options.userId,
      })
      .execute();

    return new Session({
      content: sessionContent,
      createdAt: date,
      id: sessionID,
      store: this,
      userId: options.userId,
    });
  }

  async update(session: Session): Promise<void> {
    await getRepository(DatabaseSession)
      .createQueryBuilder()
      .update()
      .set({
        content: JSON.stringify(session.getContent()),
        updatedAt: Date.now()
      })
      .where({ id: session.sessionID })
      .execute();
  }

  async destroy(sessionID: string): Promise<void> {
    await getRepository(DatabaseSession)
      .delete({ id: sessionID });
  }

  async read(sessionID: string): Promise<Session | undefined> {
    const timeouts = SessionStore.getExpirationTimeouts();

    const session = await getRepository(DatabaseSession).findOne({ id: sessionID });
    if (!session) {
      return undefined;
    }

    const createdAt = parseInt(session.createdAt.toString(), 10);
    const updatedAt = parseInt(session.updatedAt.toString(), 10);
    const sessionContent = JSON.parse(session.content);

    if (Date.now() - updatedAt > timeouts.inactivity * 1000) {
      await this.destroy(sessionID);
      return undefined;
    }

    if (Date.now() - createdAt > timeouts.absolute * 1000) {
      await this.destroy(sessionID);
      return undefined;
    }

    return new Session({
      content: sessionContent,
      createdAt,
      id: session.id,
      store: this,
      userId: session.userId,
    });
  }

  async extendLifeTime(sessionID: string): Promise<void> {
    await getRepository(DatabaseSession)
      .createQueryBuilder()
      .update()
      .set({ updatedAt: Date.now() })
      .where({ id: sessionID })
      .execute();
  }

  async clear(): Promise<void> {
    await getRepository(DatabaseSession)
      .clear();
  }

  async cleanUpExpiredSessions(): Promise<void> {
    const expiredTimeouts = SessionStore.getExpirationTimeouts();
    await getRepository(DatabaseSession)
      .createQueryBuilder()
      .delete()
      .where([
        { createdAt: LessThan(Date.now() - expiredTimeouts.absolute * 1000) },
        { updatedAt: LessThan(Date.now() - expiredTimeouts.inactivity * 1000) }
      ])
      .execute();
  }

}
