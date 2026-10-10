import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
test('recovered global stylesheet has complete UTF-8 and no unfinished comment',()=>{
 const css=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(new URL('../app/globals.css',import.meta.url)));
 assert.equal((css.match(/\/\*/g)||[]).length,(css.match(/\*\//g)||[]).length);
});
