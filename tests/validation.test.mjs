import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRanges, validatePDF, safeName } from '../src/utils/files.js';
test('page ranges preserve requested order, normalize dashes, deduplicate',()=>{assert.deepEqual(parseRanges('3, 1–2, 2',3),[3,1,2]);});
test('reject malformed, reversed and out-of-bounds ranges',()=>{for(const value of ['', '0','4','2-1','1,,2','1.5','1-x'])assert.throws(()=>parseRanges(value,3));});
test('PDF upload checks inspect file contents',async()=>{await assert.rejects(validatePDF(new File(['not PDF'],'test.pdf')));await assert.rejects(validatePDF(new File([],'empty.pdf')));await validatePDF(new File(['%PDF-1.4\n'],'valid.pdf'));});
test('export filename cannot include path separators',()=>{assert.equal(safeName('../sample?.pdf'),'..-sample-.pdf');});
