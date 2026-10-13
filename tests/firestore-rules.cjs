// Run ONLY through the local Firestore emulator; never connects to production.
// firebase emulators:exec --only firestore --project demo-homehub "node tests/firestore-rules.cjs"
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error('Start the local Firestore emulator with emulators:exec first.');
}
const project = 'demo-homehub';
const base = 'http://' + host + '/v1/projects/' + project + '/databases/(default)/documents/';
const owner = 'owner-' + randomUUID();
const member = 'member-' + randomUUID();
const outsider = 'outsider-' + randomUUID();
const id = randomUUID().replaceAll('-', '');
function token(uid) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return encode({alg:'none',typ:'JWT'}) + '.' + encode({
        sub:uid,user_id:uid,aud:project,iss:'https://securetoken.google.com/' + project,
        iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
        firebase:{sign_in_provider:'custom',identities:{}}
    }) + '.';
}
function field(value) {
    if (Array.isArray(value)) return {arrayValue:{values:value.map(field)}};
    if (value && typeof value === 'object') return {mapValue:{fields:fields(value)}};
    return {stringValue:value};
}
function fields(data) { return Object.fromEntries(Object.entries(data).map(([key,value])=>[key,field(value)])); }
let checks = 0;
async function check(method, path, uid, data, allowed) {
    const response = await fetch(base + path, {
        method,
        headers:{'Content-Type':'application/json',...(uid ? {Authorization:'Bearer ' + token(uid)} : {})},
        ...(data ? {body:JSON.stringify({fields:fields(data)})} : {})
    });
    const body = await response.text();
    assert.equal(allowed ? response.ok : response.status === 403,true,method + ' ' + path + ': ' + response.status + ' ' + body);
    checks++;
}
(async () => {
    const record = {ownerId:owner,members:[owner],categories:[]};
    await check('PATCH','users/' + owner,owner,{categories:[]},true);
    await check('GET','users/' + owner,outsider,null,false);
    await check('PATCH','users/' + owner,outsider,{categories:[]},false);
    await check('PATCH','inventories/' + id,owner,record,true);
    await check('GET','inventories/' + id,null,null,false);
    await check('GET','inventories/' + id,member,null,true); // Possession of ID grants signed-in read.
    await check('GET','inventories',member,null,false); // No inventory enumeration.
    await check('PATCH','inventories/' + id,member,{...record,categories:[{name:'Unauthorized',items:[]}]},false);
    await check('PATCH','inventories/' + id,member,{...record,members:[owner,outsider]},false);
    const joined = {...record,members:[owner,member]};
    await check('PATCH','inventories/' + id,member,joined,true);
    const edited = {...joined,categories:[{name:'Kitchen',items:[]}]};
    await check('PATCH','inventories/' + id,member,edited,true);
    await check('PATCH','inventories/' + id,member,{...edited,ownerId:member},false);
    await check('PATCH','inventories/' + id,member,{...edited,members:[member]},false);
    await check('PATCH','inventories/' + id,member,{...edited,categories:'invalid'},false);
    await check('DELETE','inventories/' + id,member,null,false);
    await check('PATCH','inventories/not-a-sharing-id',owner,record,false);
    console.log('PASS: ' + checks + ' Firestore Rules checks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
