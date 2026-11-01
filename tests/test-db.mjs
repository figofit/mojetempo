import {DatabaseSync} from 'node:sqlite';
export function testDatabase() {
  const sqlite=new DatabaseSync(':memory:');
  const db={prepare(sql){const bound=(values=[])=>({bind:(...next)=>bound(next.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v)),first:async()=>sqlite.prepare(sql).get(...values)||null,all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}})});return bound();},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}},withSession:()=>db};
  return {db,sqlite};
}
