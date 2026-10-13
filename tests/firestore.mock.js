export function doc(_db,collection,uid){if(collection!=='users')throw Error('Wrong path');return uid;}
function read(uid){return JSON.parse(localStorage.getItem('test-doc-'+uid)||'null');}
function snapshot(value){return {exists:()=>value!==null,data:()=>structuredClone(value)};}
export async function getDoc(uid){if(localStorage.getItem('test-load-fail'))throw Error('load-failed');return snapshot(read(uid));}
export async function runTransaction(_db,callback){
 if(localStorage.getItem('test-save-fail'))throw Error('save-failed');
 let staged;
 await callback({get:async uid=>snapshot(read(uid)),set:(uid,value,options)=>{
   if(!options?.merge)throw Error('Merge required');
   staged={uid,value:{...read(uid),...structuredClone(value)}};
 }});
 if(staged)localStorage.setItem('test-doc-'+staged.uid,JSON.stringify(staged.value));
}
