// std
import { deepStrictEqual, notStrictEqual, strictEqual } from 'assert';
import { createReadStream, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync } from 'fs';
import { join } from 'path';

// 3p
import {
  Config, Context, createApp, createService, File, FileList, getApiRequestBody, HttpResponseOK, IApiRequestBody, Post
} from '@foal/core';
import * as request from 'supertest';

// FoalTS
import { Disk } from './disk.service';
import { FilesSchema, FieldsSchema, ValidateMultipartFormDataBody } from './validate-multipart-form-data-body.hook';

interface Actual {
  body?: any;
  files?: FileList;
}

describe('ValidateMultipartFormDataBody', () => {

  beforeEach(() => {
    Config.set('settings.loggerFormat', 'none');
    Config.set('settings.disk.driver', 'local');

    Config.set('settings.disk.local.directory', 'uploaded');

    mkdirSync('uploaded');
    mkdirSync('uploaded/images');
  });

  afterEach(() => {
    Config.remove('settings.loggerFormat');
    Config.remove('settings.disk.driver');

    Config.remove('settings.disk.local.directory');

    const contents = readdirSync('uploaded/images');
    for (const content of contents) {
      unlinkSync(join('uploaded/images', content));
    }
    rmdirSync('uploaded/images');
    rmdirSync('uploaded');
  });

  // Note: Unfortunatly, in order to have a multipart request object,
  // we need to create an Express server to test the hook.
  function createAppWithHook(schema: { files: FilesSchema, fields?: FieldsSchema }, actual: Actual): Promise<any> {
    @ValidateMultipartFormDataBody(schema.files, schema.fields)
    class AppController {
      @Post('/')
      index(ctx: Context) {
        actual.body = ctx.request.body;
        actual.files = ctx.files;
        return new HttpResponseOK();
      }
    }
    return createApp(AppController);
  }

  it('should return an HttpResponseBadRequest if the request is not of type multipart/form-data.', async () => {
    const app = await createAppWithHook({
      files: {}
    }, {});

    await request(app)
      .post('/')
      .send({})
      .expect(400)
      .expect({
        headers: {
          error: 'INVALID_MULTIPART_FORM_DATA_REQUEST',
          message: 'Unsupported content type: application/json'
        }
      });
  });

  describe('should set ctx.request.body with the fields', () => {

    it('when the fields are validated against the given schema.', async () => {
      const actual: Actual = {};
      const app = await createAppWithHook({
        fields: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          },
          additionalProperties: false,
        },
        files: {}
      }, actual);

      await request(app)
        .post('/')
        .field('name', 'hello')
        .field('unexpectedName', 'world')
        .expect(200);

      deepStrictEqual(actual.body, {
        name: 'hello'
      });
    });

    it('when no schema is given in the hook.', async () => {
      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {}
      }, actual);

      await request(app)
        .post('/')
        .field('name', 'hello')
        .expect(200);

      deepStrictEqual(actual.body, {
        name: 'hello'
      });
    });

  });

  describe('when the fields are not validated against the given schema', () => {

    it('should return an HttpResponseBadRequest.', async () => {
      const app = await createAppWithHook({
        fields: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            name2: { type: 'string' }
          },
          required: ['name', 'name2']
        },
        files: {}
      }, {});

      await request(app)
        .post('/')
        .field('name', 'hello')
        .expect(400)
        .expect({
          body: [
            {
              dataPath: '',
              keyword: 'required',
              message: 'should have required property \'name2\'',
              params: {
                missingProperty: 'name2'
              },
              schemaPath: '#/required',
            }
          ]
        });
    });

    it('should not have uploaded the files.', async () => {
      const app = await createAppWithHook({
        fields: {
          type: 'object',
          properties: {
            name: { type: 'boolean' }
          }
        },
        files: {
          foobar: { required: false, multiple: true, saveTo: 'images' },
          foobar2: { required: false, multiple: false, saveTo: 'images' },
          foobar3: { required: false, multiple: false, saveTo: 'images' },
          foobar4: { required: false, multiple: false },
        }
      }, {});

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .attach('foobar', createReadStream('src/image.test2.png'))
        .attach('foobar2', createReadStream('src/image.test2.png'))
        .attach('foobar4', createReadStream('src/image.test2.png'))
        .field('name', 'hello')
        .expect(400); // Test that no error is rejected in the hook (error 500).

      strictEqual(readdirSync('uploaded/images').length, 0);
    });

  });

  describe('when the max file size has been reached', () => {

    beforeEach(() => {
      Config.set('settings.multipartRequests.fileSizeLimit', 200000);
    });

    afterEach(() => {
      Config.remove('settings.multipartRequests.fileSizeLimit');
    });

    it('should return an HttpResponseBadRequest.', async () => {
      const app = await createAppWithHook({
        files: {
          foobar: { required: false },
          foobar2: { required: false },
        }
      }, {});

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .attach('foobar2', createReadStream('src/image.test2.png'))
        .expect(400)
        .expect({
          body: {
            error: 'FILE_SIZE_LIMIT_REACHED',
            message: 'The file "foobar2" is too large. The maximum file size is 200000 bytes.'
          }
        });
    });

    it('should not have uploaded the files.', async () => {
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, saveTo: 'images' },
          foobar2: { required: false, saveTo: 'images' },
        }
      }, {});

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .attach('foobar2', createReadStream('src/image.test2.png'))
        .expect(400); // Test that no error is rejected in the hook (error 500).

      strictEqual(readdirSync('uploaded/images').length, 0);
    });

  });

  describe('when the max number of files has been reached', () => {

    beforeEach(() => {
      Config.set('settings.multipartRequests.fileNumberLimit', 1);
    });

    afterEach(() => {
      Config.remove('settings.multipartRequests.fileNumberLimit');
    });

    it('should return an HttpResponseBadRequest.', async () => {
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, multiple: true },
        }
      }, {});

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .attach('foobar', createReadStream('src/image.test2.png'))
        .expect(400)
        .expect({
          body: {
            error: 'FILE_NUMBER_LIMIT_REACHED',
            message: 'Too many files updated. The maximum number of files allowed is 1.'
          }
        });
    });

    it('should not have uploaded the files.', async () => {
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, multiple: true, saveTo: 'images' },
        }
      }, {});

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .attach('foobar', createReadStream('src/image.test2.png'))
        .expect(400); // Test that no error is rejected in the hook (error 500).

      strictEqual(readdirSync('uploaded/images').length, 0);
    });

  });

  it('should ignore the upload of unexpected files.', async () => {
    const actual: Actual = {};
    const app = await createAppWithHook({
      files: {}
    }, actual);

    await request(app)
      .post('/')
      .attach('foobar', createReadStream('src/image.test.png'))
      .expect(200);

    deepStrictEqual(actual.files!.get('foobar'), []);
    strictEqual(readdirSync('uploaded/images').length, 0);
  });

  describe('when a file is not uploaded and it is not required', () => {

    it('should have "ctx.files.get()" return an empty array.', async () => {
      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {
          foobar: { required: false }
        }
      }, actual);

      await request(app)
        .post('/')
        .field('name', 'hello')
        .expect(200);

      deepStrictEqual(actual.files!.get('foobar'), []);
    });

  });

  describe('when a file is not uploaded but it is required', () => {

    it('should return an HttpResponseBadRequest.', async () => {
      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {
          foobar: { required: true }
        }
      }, actual);

      return request(app)
        .post('/')
        .field('name', 'hello')
        .expect(400)
        .expect({
          body: {
            error: 'MISSING_FILE',
            message: 'The file "foobar" is required.'
          }
        });
    });

    it('should not have uploaded the other files.', async () => {
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, multiple: true, saveTo: 'images' },
          foobar2: { required: false, multiple: false, saveTo: 'images' },
          foobar3: { required: false, multiple: false, saveTo: 'images' },
          foobar4: { required: false, multiple: false },
          requiredFoobar: { required: true },
        }
      }, {});

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .attach('foobar', createReadStream('src/image.test2.png'))
        .attach('foobar2', createReadStream('src/image.test2.png'))
        .attach('foobar4', createReadStream('src/image.test2.png'))
        .field('name', 'hello')
        .expect(400); // Test that no error is rejected in the hook (error 500).

      strictEqual(readdirSync('uploaded/images').length, 0);
    });

  });

  describe('when a file is uploaded and saveTo is undefined', () => {

    it('should create a buffer and add the file to ctx.files.', async () => {
      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {
          foobar: { required: true }
        }
      }, actual);

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .expect(200);

      deepStrictEqual(actual.files!.get('foobar'), [new File({
        buffer: readFileSync('src/image.test.png'),
        encoding: '7bit',
        filename: 'image.test.png',
        mimeType: 'image/png',
      })]);
    });

  });

  describe('when a file is uploaded and saveTo is defined', () => {

    let disk: Disk;

    beforeEach(() => {
      Config.set('settings.logErrors', false);

      disk = createService(Disk);
    });

    afterEach(() => {
      Config.remove('settings.logErrors');
    });

    it('should not kill the process if Disk.write throws an error.', async () => {
      Config.set('settings.disk.driver', '@foal/internal-test');

      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, saveTo: 'images' },
          foobar2: { required: false },
        }
      }, actual);

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .expect(500);
    });

    it('should not kill the process if Disk.write rejects an error.', async () => {
      Config.remove('settings.disk.local.directory');

      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, saveTo: 'images' },
          foobar2: { required: false }
        }
      }, actual);

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .expect(500);
    });

    it('should save the file to the disk and set ctx.request.files with its path.', async () => {
        const actual: Actual = {};
        const app = await createAppWithHook({
          files: {
            foobar: { required: false, saveTo: 'images' }
          }
        }, actual);

        await request(app)
          .post('/')
          .attach('foobar', createReadStream('src/image.test.png'))
          .expect(200);

        const foobar = actual.files!.get('foobar')[0];
        strictEqual(typeof foobar, 'object');
        notStrictEqual(foobar, null);

        const path = foobar.path;
        strictEqual(typeof path, 'string');

        deepStrictEqual(
          readFileSync('src/image.test.png'),
          (await disk.read(path, 'buffer')).file
        );

        strictEqual(foobar.encoding, '7bit');
        strictEqual(foobar.mimeType, 'image/png');
        strictEqual(foobar.filename, 'image.test.png');
      }
    );

    it('should keep the extension of the file if it has one.', async () => {
      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, saveTo: 'images' }
        }
      }, actual);

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'))
        .expect(200);


      const foobar = actual.files!.get('foobar')[0];
      strictEqual(typeof foobar, 'object');

      const fragments = foobar.path.split('.');
      strictEqual(fragments.length, 2);
      strictEqual(fragments[1], 'png');
    });

    it('should not keep the extension of the file if it has none.', async () => {
      const actual: Actual = {};
      const app = await createAppWithHook({
        files: {
          foobar: { required: false, saveTo: 'images' }
        }
      }, actual);

      await request(app)
        .post('/')
        .attach('foobar', createReadStream('src/image.test.png'), { filename: 'my_image' })
        .expect(200);

      const foobar = actual.files!.get('foobar')[0];
      strictEqual(typeof foobar, 'object');

      const fragments = foobar.path.split('.');
      strictEqual(fragments.length, 1);
    });

  });

  describe('should define an API specification', () => {

    const fieldsSchema: FieldsSchema = {
      type: 'object',
      properties: {
        bar: { type: 'integer' },
        foo: { type: 'integer' },
      },
      required: ['bar', 'foo']
    };
    const filesSchema: FilesSchema = {
      album: { required: false, multiple: true },
      profile: { required: true }
    }

    const expectedRequestBody: IApiRequestBody = {
      content: {
        'multipart/form-data': {
          schema: {
            properties: {
              album: {
                items: {
                  format: 'binary',
                  type: 'string',
                },
                type: 'array',
              },
              bar: {
                type: 'integer'
              },
              foo: {
                type: 'integer'
              },
              profile: {
                format: 'binary',
                type: 'string',
              },
            },
            required: [ 'bar', 'foo', 'profile' ],
            type: 'object',
          }
        }
      }
    };

    it('unless options.openapi is false.', () => {
      @ValidateMultipartFormDataBody(filesSchema, fieldsSchema, { openapi: false })
      class Foobar {}

      deepStrictEqual(getApiRequestBody(Foobar), undefined);
    });

    it('with the proper request body.', () => {
      @ValidateMultipartFormDataBody(filesSchema, fieldsSchema)
      class Foobar {}

      const actualRequestBody = getApiRequestBody(Foobar);
      deepStrictEqual(actualRequestBody, expectedRequestBody);
    });

  });

});
