import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanSecretText} from '../lib/server/secret-patterns.js';
test('suspicious credentials are counted without returning values',()=>{
 const secret='sb_secret_'+'a'.repeat(32),pem='-----BEGIN '+'PRIVATE KEY-----';
 const result=scanSecretText('first\n'+secret+'\n'+pem);
 assert.deepEqual(result,[{rule:'private-key',line:3},{rule:'credential',line:2}]);
 assert.doesNotMatch(JSON.stringify(result),/aaaa|BEGIN/);
});
test('privileged JWT is detected but a public anon token is not a secret finding',()=>{
 const token=role=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({role,exp:9999999999})).toString('base64url')+'.'+'x'.repeat(30);
 assert.equal(scanSecretText(token('service_role'))[0].rule,'privileged-jwt');
 assert.deepEqual(scanSecretText(token('anon')),[]);
 assert.deepEqual(scanSecretText('synthetic-refresh and public configuration'),[]);
});
