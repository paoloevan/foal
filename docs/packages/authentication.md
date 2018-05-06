# @foal/authentication

This package is dedicated to authentication and authorization. You'll find a complete example at the end of the page.

## Authentication

Authentication is divided in four parts in FoalTS:
- the `Authenticator` services,
- the `authentication` controller factory,
- the `UserModelService` service,
- and the `authenticate` pre-hook.

> *Note*: FoalTS authentication requires the use of sessions.

### The `Authenticator` interface

```typescript
interface IAuthenticator<User> {
  authenticate(credentials: any): User | null | Promise<User|null>;
}
```

A service implementing the `IAuthenticator` interface aims to authenticate a user from its credentials. Usual credentials would be an email and a password but it could be anything you want (such Google, Facebook or Twitter credentials for example). If the credentials are invalid no error should be thrown and the `authenticate` method should return `null`.

- `EmailAndPasswordAuthenticatorService`

`EmailAndPasswordAuthenticatorService` is an abstract class that implements the `Authenticator` interface. Its `authenticate` method is asynchronous and takes an `{ email: string, password: string }` object as parameter.

Its constructor takes a user service that must implement the `IModelService` interface.

*Example*:
```typescript
import { EmailAndPasswordAuthenticatorService } from '@foal/authentication';
import { Service } from '@foal/core';

import { User, UserService } from './user.service.ts';

@Service()
export class AuthenticatorService extends EmailAndPasswordAuthenticatorService<User> {

  constructor(userService: UserService) {
    super(userService);
  }

}
```


### The `authentication` controller factory

The `authentication` controller factory attaches an `Authenticator` service to the request handler. It accepts optional options `{ failureRedirect?: string, successRedirect?: string }`.

When the authentication succeeds it returns an `HttpResponseNoContent` if `successRedirect` is undefined or an `HttpResponseRedirect` if it is defined.

When the authentication fails it returns an `HttpResponseUnauthorized` if `failureRedirect` is undefined or an `HttpResponseRedirect` if it is defined.

```typescript
import { Module } from '@foal/core';
import { authentication, validateEmailCredentialsFormat } from '@foal/authentication';

import { AuthenticatorService } from './authenticator.service';

export const AuthModule: Module = {
  controllers: [
    authentication
      .attachService('/login', AuthenticatorService, {
        failureRedirect: '/login?invalid_credentials=true',
        successRedirect: '/home'
      })
      .withPreHook(validateEmailCredentialsFormat())
  ]
}
```

### The `authenticate` pre-hook

The `authenticate` pre-hook is used to authenticate the user for each request. If the user has already logged in (thanks to the `authentication` controller factory), then the `user context` will be defined.

Usually it is registered once within the `AppModule` `preHooks`.

*Example:*
```typescript
import { basic, Module } from '@foal/core';
import { authenticate } from '@foal/authentication';

export const AppModule: Module = {
  controllers: [
    basic
      .attachHandlingFunction('GET', '/foo', ctx => {
        console.log('In handler: ', ctx.user);
      })
      .withPreHook(ctx => {
        console.log('In pre-hook: ', ctx.user);
      })
      .withPostHook(ctx => {
        console.log('In post-hook: ', ctx.user);
      })
  ]
  preHooks: [
    authenticate(),
  ]
}
```

### The abstract class `UserModelService`

Its constructor takes three arguments:
- a sequelize schema that will extend a default one,
- a connection,
- and an optional array of parsers (see the full example at the end of the page).

### Logging out

To log out the user, you need to use the `attachLogout` function.

```typescript
authentication
  .attachLogout('/logout', { redirect: '/login' });
```

When the logout succeeds it returns an `HttpResponseNoContent` if `redirect` is undefined or an `HttpResponseRedirect` if it is defined.

## Authorization

### `restrictAccessToAuthenticated()`

`restrictAccessToAuthenticated` is a pre-hook to restrict the access to authenticated users.

If no user is authenticated the pre-hook returns an `HttpResponseUnauthorized`.

*Example*:
```typescript
import { authenticate, restrictAccessToAuthenticated } from '@foal/authentication';
import { basic, Module } from '@foal/core';

export const AppModule: Module = {
  controllers: [
    basic
      .attachHandlingFunction('POST', '/user', ctx => {
        console.log(ctx.user);
      })
      .withPreHook(restrictAccessToAuthenticated()),
  ],
  preHooks: [
    authenticate()
  ]
}
```

### `restrictAccessToAdmin()`

`restrictAccessToAdmin` is a pre-hook to restrict the access to admin users.

If no user is authenticated the pre-hook returns an `HttpResponseUnauthorized`.

If the user is not an admin, namely it has no property `isAdmin` or this property is false, then the pre-hook returns an `HttpResponseForbidden`.

*Example*:
```typescript
import { authenticate, restrictAccessToAdmin } from '@foal/authentication';
import { basic, Module } from '@foal/core';

export const AppModule: Module = {
  controllers: [
    basic
      .attachHandlingFunction('POST', '/user', ctx => {
        console.log(ctx.user);
      })
      .withPreHook(restrictAccessToAdmin()),
  ],
  preHooks: [
    authenticate()
  ]
}
```

## A complete example

**Warning**: this example does not include the csrf protection.

```
- src
  '- app
    |- auth
    | |- auth.module.ts
    | '- auth.service.ts
    |- shared
    | '- user.service.ts
    | '- user.interface.ts
    '-app.module.ts
```

```typescript
// app.module.ts
import { authenticate, restrictToAuthenticated } from '@foal/authentication';
import { basic, Module } from '@foal/core';

import { AuthModule } from './auth/auth.module';

export const AppModule: Module = {
  controllers: [
    basic
      .attachHandlingFunction('GET', '/foo', ctx => {
        console.log(ctx.user);
      })
      .withPreHook(restrictToAuthenticated())
  ],
  modules: [
    AuthModule
  ],
  preHooks: [
    authenticate()
  ]
}
```

```typescript
// auth.module.ts
import { authentication, validateEmailCredentialsFormat } from '@foal/authentication';
import { basic, HttpResponseOK, Module } from '@foal/core';

import { AuthService } from './auth.service';

export const AuthModule: Module = {
  controllers: [
    authentication
      .attachService('/login', AuthService)
      .withPreHook(validateEmailCredentialsFormat()),
    // In practice we would use below the view controller
    // factory with a template.
    basic
      .attachHandlingFunction('GET', '/login', () => {
        return new HttpResponseOK(`
          <form method="POST" action="/login">
            Email: <input type="email" name="email">
            <br>
            Password: <input type="password" name="password">
            <br>
            <button type="submit">Log in</button>
          </form>
        `);
      })
  ]
}
```

```typescript
// auth.service.ts
import { EmailAndPasswordAuthenticatorService } from '@foal/authentication';
import { Service } from '@foal/core';

import { User, UserService } from '../shared/user.service.ts';

@Service()
export class AuthService<User> extends EmailAndPasswordAuthenticatorService {

  constructor(userService: UserService) {
    super(userService);
  }

}
```

```typescript
// user.service.ts
import { Service } from '@foal/core';
// other imports... (ConnectionService, etc)

import { BaseUser, EmailAndPassword, emailAndPasswordSchema, parsePassword } from '@foal/authentication';

export type User = BaseUser & EmailAndPassword;

@Service()
export class UserService extends UserModelService<User> {
  constructor(connection: ConnectionService) {
    super(emailAndPasswordSchema, connection, [ parsePassword ]);
  }

}

```