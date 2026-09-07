import { writeFile } from 'node:fs/promises'
import { CBSE_2026_27_XI_NODES } from '../src/data/curriculum/cbse/2026-27/class-11/outlines.ts'
import { CBSE_2026_27_XII_NODES } from '../src/data/curriculum/cbse/2026-27/class-12/outlines.ts'

// Additive reconciliation: preserve historical nodes referenced by saved logs.
const nodes = [...CBSE_2026_27_XI_NODES, ...CBSE_2026_27_XII_NODES]
const payload = nodes.map((n) => [n.id, n.subjectId, n.parentId, n.nodeType, n.title, n.officialOrder, n.sourcePage, n.sourceUrl])
const sql = `begin;
create temporary table recall_catalogue_sync(value jsonb) on commit drop;
insert into recall_catalogue_sync values ($curriculum$${JSON.stringify(payload)}$curriculum$::jsonb);
insert into public.curriculum_nodes (id,subject_id,parent_id,node_type,title,official_order,source_page,source_url,external_key,active)
select n->>0,n->>1,null,n->>3,n->>4,(n->>5)::integer,(n->>6)::integer,n->>7,substring(n->>0 from 6),true
from recall_catalogue_sync, jsonb_array_elements(value) n
on conflict(id) do update set title=excluded.title, official_order=excluded.official_order, source_page=excluded.source_page, source_url=excluded.source_url, active=true, updated_at=clock_timestamp();
update public.curriculum_nodes c set parent_id=n->>2, updated_at=clock_timestamp()
from recall_catalogue_sync, jsonb_array_elements(value) n where c.id=n->>0;
commit;
`
const target = process.argv[2]
if (!target) throw new Error('Pass the new migration output path.')
await writeFile(target, sql)
console.log(`Wrote additive reconciliation for ${nodes.length} nodes.`)
