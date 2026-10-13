export function doc(_db,collection,uid) {
 if (!['users','inventories'].includes(collection)) throw Error('Wrong path');
 return collection === 'users' ? uid : 'inventories:' + uid;
}
function read(id){return JSON.parse(localStorage.getItem('test-doc-'+id)||'null');}
function snapshot(value){return {exists:()=>value!==null,data:()=>structuredClone(value)};}
export async function getDoc(id){if(localStorage.getItem('test-load-fail'))throw Error('load-failed');return snapshot(read(id));}
export async function runTransaction(_db,callback){
 if(localStorage.getItem('test-save-fail'))throw Error('save-failed');
 const staged = new Map();
 await callback({
  get:async id=>snapshot(read(id)),
  set:(id,value,options)=>staged.set(id,options?.merge ? {...read(id),...structuredClone(value)} : structuredClone(value))
 });
 for(const [id,value] of staged) localStorage.setItem('test-doc-'+id,JSON.stringify(value));
}
