-- Recall+ CBSE Class XII curriculum (additive)
-- Academic year: 2026-27 · version cbse-2026-27-xii-v1
-- Inserts XII catalogue + nodes; updates subject-combination and save RPCs.
-- Does not alter existing Class XI profiles or truncate user data.

begin;

create temporary table recall_xii_seed_payload (
  value jsonb not null
) on commit drop;

insert into recall_xii_seed_payload (value)
values ($payload${"schemaVersion":1,"idempotencyKey":"cbse-2026-27-xii-v1","version":{"id":"cbse-2026-27-xii-v1","board":"CBSE","academicYear":"2026-27","grade":"XII","version":"1.0.0","status":"reviewed","sourceUrl":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Curriculum_SecP2_2026-27.pdf","sourceTitle":"Secondary Curriculum Part II (Classes XI-XII), 2026-27","sourceHash":"5f43a711751963bfbae8abdf92b66cd125042f6dcb38f36ebde6432e2c674042","importedAt":"2026-08-12T00:00:00.000Z","verifiedAt":"2026-08-12T00:00:00.000Z"},"subjects":[{"id":"cbse-2026-27-xii-301","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"301","name":"English Core","shortName":"English Core","subjectGroup":"L","category":"language","hasTheory":true,"hasPractical":false,"hasInternalAssessment":true,"pathwayTags":["common","language"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/English_core_SecP2_2026-27.pdf","title":"English Core, Classes XI-XII, 2026-27; textbooks indexed via https://ncert.nic.in/textbook.php","sha256":"d2af35ab80de3dc6f1f62f3cd2b58f9cc95a39ca1d47abc45412a1034459092c"},"contentStatus":"verified_outline","officialOrder":1,"active":true},{"id":"cbse-2026-27-xii-302","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"302","name":"Hindi Core","shortName":"Hindi Core","subjectGroup":"L","category":"language","hasTheory":true,"hasPractical":false,"hasInternalAssessment":true,"pathwayTags":["common","language"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindi_Core_SecP2_2026-27.pdf","title":"Hindi Core, Classes XI-XII, 2026-27; textbooks indexed via https://ncert.nic.in/textbook.php","sha256":"5edab54393581154c2cf8b78802af528c2c1daeb7acfc377c461851b00f55d51"},"contentStatus":"verified_outline","officialOrder":2,"active":true},{"id":"cbse-2026-27-xii-118","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"118","name":"French","shortName":"French","subjectGroup":"L","category":"language","hasTheory":true,"hasPractical":false,"hasInternalAssessment":true,"pathwayTags":["common","language"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/French_SecP2_2026-27.pdf","title":"French, Classes XI-XII, 2026-27","sha256":null},"contentStatus":"verified_outline","officialOrder":3,"active":true},{"id":"cbse-2026-27-xii-027","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"027","name":"History","shortName":"History","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/History_SecP2_2026-27.pdf","title":"History, Classes XI-XII, 2026-27","sha256":"7c0c1280f90db4cf7f38824723ddda852c250bcbb5a458a20c2977c4381e53c4"},"contentStatus":"verified_outline","officialOrder":1,"active":true},{"id":"cbse-2026-27-xii-028","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"028","name":"Political Science","shortName":"Political Science","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PoliticalScience_SecP2_2026-27.pdf","title":"Political Science, Classes XI-XII, 2026-27","sha256":"0914d089d6cd78cf56eec27fff9d42400706d8edf04163a9106b242df9e617e8"},"contentStatus":"verified_outline","officialOrder":2,"active":true},{"id":"cbse-2026-27-xii-029","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"029","name":"Geography","shortName":"Geography","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Geography_SecP2_2026-27.pdf","title":"Geography, Classes XI-XII, 2026-27","sha256":"00e85430d75f8063902943817a57c9f22f037efb1d188b26d342b88550f8b90b"},"contentStatus":"verified_outline","officialOrder":3,"active":true},{"id":"cbse-2026-27-xii-030","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"030","name":"Economics","shortName":"Economics","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["commerce","humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Economics_SecP2_2026-27.pdf","title":"Economics, Classes XI-XII, 2026-27","sha256":"927800c6e72b377509533fbe281fb1aa72383e20a3ab5b7b480bd976330b49fa"},"contentStatus":"verified_outline","officialOrder":4,"active":true},{"id":"cbse-2026-27-xii-034","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"034","name":"Hindustani Music Vocal","shortName":"Hindustani Music Vocal","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Hindustani_Vocal_SecP2_2026-27.pdf","title":"Hindustani Music Vocal, Classes XI-XII, 2026-27","sha256":null},"contentStatus":"verified_outline","officialOrder":5,"active":true},{"id":"cbse-2026-27-xii-037","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"037","name":"Psychology","shortName":"Psychology","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":true,"pathwayTags":["science","humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Psychology_SecP2_2026-27.pdf","title":"Psychology, Classes XI-XII, 2026-27","sha256":"98f63864c0e161fc5d31347764e1edf591de7ae2028a9351c5519fb3429d216a"},"contentStatus":"verified_outline","officialOrder":6,"active":true},{"id":"cbse-2026-27-xii-039","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"039","name":"Sociology","shortName":"Sociology","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Sociology_SecP2_2026-27.pdf","title":"Sociology, Classes XI-XII, 2026-27","sha256":"8b6ba4e2bd232445be46fb01a64030a6d1b7af3d0cd066fefca73a0850a10684"},"contentStatus":"verified_outline","officialOrder":7,"active":true},{"id":"cbse-2026-27-xii-041","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"041","name":"Mathematics","shortName":"Mathematics","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["science","commerce","humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Maths_SecP2_2026-27.pdf","title":"Mathematics, Classes XI-XII, 2026-27","sha256":"5bf4105d4076189fe00b879fd6d41ffadec87a894a078a7fb912b2f219769572"},"contentStatus":"verified_outline","officialOrder":8,"active":true},{"id":"cbse-2026-27-xii-241","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"241","name":"Applied Mathematics","shortName":"Applied Mathematics","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["commerce","humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Applied_Mathematics_SecP2_2026-27.pdf","title":"Applied Mathematics, Classes XI-XII, 2026-27","sha256":"3125b1b6b00d8081bff34a1276d5f5203daa719af961d943380b4b0cb9d35a70"},"contentStatus":"verified_outline","officialOrder":9,"active":true},{"id":"cbse-2026-27-xii-042","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"042","name":"Physics","shortName":"Physics","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["science"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf","title":"Physics, Classes XI-XII, 2026-27","sha256":"9e32271cf5a86caa605cffe2a4b5e19710abc3d3a8715ef725ba78cd94caf1f7"},"contentStatus":"verified_outline","officialOrder":10,"active":true},{"id":"cbse-2026-27-xii-043","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"043","name":"Chemistry","shortName":"Chemistry","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["science"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Chemistry_SecP2_2026-27.pdf","title":"Chemistry, Classes XI-XII, 2026-27","sha256":"5610f09d357d3ccc9a7b39fc29cb7b1f4530847753783b16c72fff691acd2418"},"contentStatus":"verified_outline","officialOrder":11,"active":true},{"id":"cbse-2026-27-xii-044","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"044","name":"Biology","shortName":"Biology","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["science"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Biology_SecP2_2026-27.pdf","title":"Biology, Classes XI-XII, 2026-27","sha256":"3a5767515b41b12b9356151e759beba48bb15a1b711b96c321fa273a7fa7a6ee"},"contentStatus":"verified_outline","officialOrder":12,"active":true},{"id":"cbse-2026-27-xii-048","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"048","name":"Physical Education","shortName":"Physical Education","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":true,"pathwayTags":["common"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/PhysicalEducation_SecP2_2026-27.pdf","title":"Physical Education, Classes XI-XII, 2026-27","sha256":"5a063f5bdc3a92d60a4a86e83c985ffafc7d716359ab511cb2f09a0275c02c7a"},"contentStatus":"verified_outline","officialOrder":13,"active":true},{"id":"cbse-2026-27-xii-049","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"049","name":"Painting","shortName":"Painting","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Fine_Arts_SecP2_2026-27.pdf","title":"Fine Arts / Painting, Classes XI-XII, 2026-27","sha256":null},"contentStatus":"verified_outline","officialOrder":14,"active":true},{"id":"cbse-2026-27-xii-054","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"054","name":"Business Studies","shortName":"Business Studies","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["commerce"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/BusinessStudies_SecP2_2026-27.pdf","title":"Business Studies, Classes XI-XII, 2026-27","sha256":"94230c4d0627fc919ca96dd02dd1df1f21a065dd1f04455df364df7350fa8cb2"},"contentStatus":"verified_outline","officialOrder":15,"active":true},{"id":"cbse-2026-27-xii-055","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"055","name":"Accountancy","shortName":"Accountancy","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["commerce"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Accountancy_SecP2_2026-27.pdf","title":"Accountancy, Classes XI-XII, 2026-27","sha256":"4a87dbd15758e42c2aa454d83708299a04b6fc12896392b13d12b9ae857ecc27"},"contentStatus":"verified_outline","officialOrder":16,"active":true},{"id":"cbse-2026-27-xii-066","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"066","name":"Entrepreneurship","shortName":"Entrepreneurship","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["commerce","humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Enterprenuership_SecP2_2026-27.pdf","title":"Entrepreneurship, Classes XI-XII, 2026-27","sha256":null},"contentStatus":"verified_outline","officialOrder":17,"active":true},{"id":"cbse-2026-27-xii-074","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"074","name":"Legal Studies","shortName":"Legal Studies","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":false,"hasInternalAssessment":false,"pathwayTags":["commerce","humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/LegalStudies_SecP2_2026-27.pdf","title":"Legal Studies, Classes XI-XII, 2026-27","sha256":"d1f7836c059406e66d6b092cffddb5120adb27a826be7b6413936fc330dd7348"},"contentStatus":"verified_outline","officialOrder":18,"active":true},{"id":"cbse-2026-27-xii-083","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"083","name":"Computer Science","shortName":"Computer Science","subjectGroup":"A","category":"academic_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["science","commerce","humanities"],"source":{"url":"https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Computer_Science_SecP2_2026-27.pdf","title":"Computer Science, Classes XI-XII, 2026-27","sha256":"a46821a87292e5feb296a1ffdb5163f413258d1cb378b871c745539e34f96e82"},"contentStatus":"verified_outline","officialOrder":19,"active":true},{"id":"cbse-2026-27-xii-843","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"843","name":"Artificial Intelligence","shortName":"Artificial Intelligence","subjectGroup":"S","category":"skill_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["science","commerce","humanities","skill"],"source":{"url":"https://cbseacademic.nic.in/web_material/Curriculum26/SrSec/843-AI-XII.pdf","title":"Artificial Intelligence (843), Class XII, 2025-26","sha256":null},"contentStatus":"verified_outline","officialOrder":1,"active":true},{"id":"cbse-2026-27-xii-837","curriculumVersionId":"cbse-2026-27-xii-v1","subjectCode":"837","name":"Fashion Studies","shortName":"Fashion Studies","subjectGroup":"S","category":"skill_elective","hasTheory":true,"hasPractical":true,"hasInternalAssessment":false,"pathwayTags":["humanities","skill"],"source":{"url":"https://cbseacademic.nic.in/web_material/Curriculum26/SrSec/837-FASHION_STUDIES-XII.pdf","title":"Fashion Studies (837), Class XII, 2025-26","sha256":null},"contentStatus":"verified_outline","officialOrder":2,"active":true}],"nodes":[]}$payload$::jsonb);

-- ---------------------------------------------------------------------------
-- 1. Curriculum version
-- ---------------------------------------------------------------------------
insert into public.curriculum_versions (
  id,
  board,
  academic_year,
  grade,
  version,
  status,
  source_url,
  source_title,
  source_hash,
  imported_at,
  verified_at
)
select
  payload.value -> 'version' ->> 'id',
  payload.value -> 'version' ->> 'board',
  payload.value -> 'version' ->> 'academicYear',
  payload.value -> 'version' ->> 'grade',
  payload.value -> 'version' ->> 'version',
  payload.value -> 'version' ->> 'status',
  payload.value -> 'version' ->> 'sourceUrl',
  payload.value -> 'version' ->> 'sourceTitle',
  payload.value -> 'version' ->> 'sourceHash',
  (payload.value -> 'version' ->> 'importedAt')::timestamptz,
  (payload.value -> 'version' ->> 'verifiedAt')::timestamptz
from recall_xii_seed_payload as payload
on conflict (id) do update
set
  board = excluded.board,
  academic_year = excluded.academic_year,
  grade = excluded.grade,
  version = excluded.version,
  status = excluded.status,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  source_hash = excluded.source_hash,
  imported_at = excluded.imported_at,
  verified_at = excluded.verified_at;

-- ---------------------------------------------------------------------------
-- 2. Subjects
-- ---------------------------------------------------------------------------
with subjects as (
  select jsonb_array_elements(value -> 'subjects') as value
  from recall_xii_seed_payload
)
insert into public.curriculum_subjects (
  id,
  curriculum_version_id,
  subject_code,
  name,
  short_name,
  subject_group,
  category,
  has_theory,
  has_practical,
  has_internal_assessment,
  pathway_tags,
  source_url,
  source_title,
  source_hash,
  content_status,
  official_order,
  active
)
select
  subjects.value ->> 'id',
  subjects.value ->> 'curriculumVersionId',
  nullif(subjects.value ->> 'subjectCode', ''),
  subjects.value ->> 'name',
  subjects.value ->> 'shortName',
  subjects.value ->> 'subjectGroup',
  subjects.value ->> 'category',
  case
    when subjects.value ->> 'hasTheory' is null then null
    else (subjects.value ->> 'hasTheory')::boolean
  end,
  case
    when subjects.value ->> 'hasPractical' is null then null
    else (subjects.value ->> 'hasPractical')::boolean
  end,
  case
    when subjects.value ->> 'hasInternalAssessment' is null then null
    else (subjects.value ->> 'hasInternalAssessment')::boolean
  end,
  coalesce(
    (
      select array_agg(tags.value order by tags.ordinality)
      from jsonb_array_elements_text(subjects.value -> 'pathwayTags')
        with ordinality as tags(value, ordinality)
    ),
    '{}'::text[]
  ),
  subjects.value -> 'source' ->> 'url',
  subjects.value -> 'source' ->> 'title',
  nullif(subjects.value -> 'source' ->> 'sha256', ''),
  subjects.value ->> 'contentStatus',
  (subjects.value ->> 'officialOrder')::integer,
  coalesce((subjects.value ->> 'active')::boolean, true)
from subjects
on conflict (id) do update
set
  curriculum_version_id = excluded.curriculum_version_id,
  subject_code = excluded.subject_code,
  name = excluded.name,
  short_name = excluded.short_name,
  subject_group = excluded.subject_group,
  category = excluded.category,
  has_theory = excluded.has_theory,
  has_practical = excluded.has_practical,
  has_internal_assessment = excluded.has_internal_assessment,
  pathway_tags = excluded.pathway_tags,
  source_url = excluded.source_url,
  source_title = excluded.source_title,
  source_hash = excluded.source_hash,
  content_status = excluded.content_status,
  official_order = excluded.official_order,
  active = excluded.active,
  updated_at = clock_timestamp();

-- ---------------------------------------------------------------------------

-- Node outlines are applied in 20260812120100_class_12_curriculum_nodes.sql

-- 4. Subject combination validation: accept XI or XII (single version per request)
-- ---------------------------------------------------------------------------
create or replace function public.validate_recall_subject_combination(
  p_selections jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_count integer;
  v_group text;
  v_code text;
  v_conflict_codes text[];
  v_version_id text;
begin
  if (select auth.uid()) is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'code', 'INVALID_PAYLOAD',
        'message', 'Subject selections must be provided as a JSON array.',
        'subjectCodes', '[]'::jsonb
      ))
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    where jsonb_typeof(entries.value) <> 'object'
      or (
        select count(*)
        from jsonb_object_keys(entries.value) as keys(key)
        where keys.key not in ('curriculumSubjectId', 'subjectPosition', 'selectionType')
      ) > 0
      or coalesce(entries.value ->> 'curriculumSubjectId', '') = ''
      or coalesce(entries.value ->> 'subjectPosition', '') !~ '^[1-6]$'
      or coalesce(entries.value ->> 'selectionType', '') not in ('main', 'additional')
  ) then
    return jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'code', 'INVALID_PAYLOAD',
        'message', 'Each selection must contain only a subject ID, position, and selection type.',
        'subjectCodes', '[]'::jsonb
      ))
    );
  end if;

  v_count := jsonb_array_length(p_selections);
  if v_count not in (5, 6) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SUBJECT_COUNT',
      'message', 'Select exactly five main subjects and, optionally, one additional subject.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct entries.value ->> 'curriculumSubjectId')
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'DUPLICATE_SUBJECT',
      'message', 'Each subject can be selected only once.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  if (
    select count(*) <> count(distinct (entries.value ->> 'subjectPosition')::integer)
    from jsonb_array_elements(p_selections) as entries(value)
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'MAIN_POSITION',
      'message', 'Subject positions must be unique whole numbers from 1 to 6.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  if v_count in (5, 6)
    and (
      select array_agg(
        (entries.value ->> 'subjectPosition')::integer
        order by (entries.value ->> 'subjectPosition')::integer
      )
      from jsonb_array_elements(p_selections) as entries(value)
    ) is distinct from (
      case
        when v_count = 5 then array[1, 2, 3, 4, 5]
        else array[1, 2, 3, 4, 5, 6]
      end
    ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SUBJECT_POSITION_SEQUENCE',
      'message', 'Five subjects must use positions 1 to 5; a sixth subject uses position 6.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    where (
      (entries.value ->> 'subjectPosition')::integer between 1 and 5
      and entries.value ->> 'selectionType' <> 'main'
    ) or (
      (entries.value ->> 'subjectPosition')::integer = 6
      and entries.value ->> 'selectionType' <> 'additional'
    )
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SELECTION_POSITION',
      'message', 'Subjects 1 to 5 must be main and Subject 6 must be additional.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  select subjects.curriculum_version_id
  into v_version_id
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  limit 1;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    left join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.id is null
      or subjects.curriculum_version_id not in (
        'cbse-2026-27-xi-v1',
        'cbse-2026-27-xii-v1'
      )
      or not subjects.active
      or subjects.subject_group = 'IA'
      or subjects.curriculum_version_id is distinct from v_version_id
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'UNKNOWN_SUBJECT',
      'message', 'One or more subjects are unavailable in the selected CBSE Class XI/XII catalogue.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 1;

  if v_group is distinct from 'L'
    or v_code is null
    or v_code not in ('301', '302', '118') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SUBJECT_ONE_LANGUAGE',
      'message', 'Subject 1 must be English Core, Hindi Core, or French.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  v_group := null;
  v_code := null;
  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 2;

  if v_group is null or v_group not in ('L', 'A') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SUBJECT_TWO_GROUP',
      'message', 'Subject 2 must be another Group-L language or a Group-A academic elective.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where (entries.value ->> 'subjectPosition')::integer in (3, 4)
      and subjects.subject_group not in ('A', 'S')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'MAIN_SUBJECT_GROUP',
      'message', 'Subjects 3 and 4 must be Group-A academic or Group-S skill electives.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  v_group := null;
  v_code := null;
  select subjects.subject_group, subjects.subject_code
  into v_group, v_code
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where (entries.value ->> 'subjectPosition')::integer = 5;

  if v_group is distinct from 'A' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'SUBJECT_FIVE_GROUP',
      'message', 'Subject 5 must be a Group-A academic elective.',
      'subjectCodes',
      case when v_code is null then '[]'::jsonb else jsonb_build_array(v_code) end
    ));
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where (entries.value ->> 'subjectPosition')::integer = 6
      and subjects.subject_group not in ('L', 'A', 'S')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'ADDITIONAL_SUBJECT_GROUP',
      'message', 'The additional subject must be a Group-L, Group-A, or Group-S subject.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.subject_code in ('301', '302', '118')
  ) then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'REQUIRED_LANGUAGE',
      'message', 'Your combination must include English Core, Hindi Core, or French.',
      'subjectCodes', '[]'::jsonb
    ));
  end if;

  select array_agg(subjects.subject_code order by subjects.subject_code)
  into v_conflict_codes
  from jsonb_array_elements(p_selections) as entries(value)
  join public.curriculum_subjects as subjects
    on subjects.id = entries.value ->> 'curriculumSubjectId'
  where subjects.subject_code in ('041', '241');
  if coalesce(array_length(v_conflict_codes, 1), 0) > 1 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'MATH_CONFLICT',
      'message', 'You cannot select both Mathematics and Applied Mathematics.',
      'subjectCodes',
      to_jsonb(v_conflict_codes)
    ));
  end if;

  return jsonb_build_object(
    'valid',
    jsonb_array_length(v_errors) = 0,
    'errors',
    v_errors
  );
end;
$$;

comment on function public.validate_recall_subject_combination(jsonb) is
  'Validates one Recall+ Class XI or XII five-or-six-subject combination using the approved allowlist language and conflict rules.';

-- ---------------------------------------------------------------------------
-- 5. Save academic profile: accept selected curriculum version (XI or XII)
-- ---------------------------------------------------------------------------
drop function if exists public.save_recall_academic_profile(text, text, jsonb);
drop function if exists recall_private.save_recall_academic_profile_impl(text, text, jsonb);

create function recall_private.save_recall_academic_profile_impl(
  p_pathway text,
  p_school_name text,
  p_selections jsonb,
  p_curriculum_version_id text default 'cbse-2026-27-xi-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_school_name text := nullif(btrim(p_school_name), '');
  v_validation jsonb;
  v_completed_at timestamptz := clock_timestamp();
  v_version_id text := coalesce(nullif(btrim(p_curriculum_version_id), ''), 'cbse-2026-27-xi-v1');
  v_grade text;
begin
  if v_user_id is null
    or coalesce(
      (((select auth.jwt()) ->> 'is_anonymous')::boolean),
      false
    ) then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;
  if p_pathway is null
    or p_pathway not in ('science', 'commerce', 'humanities') then
    raise exception 'Invalid academic pathway.'
      using errcode = '22023';
  end if;
  if v_school_name is not null
    and char_length(v_school_name) not between 2 and 160 then
    raise exception 'School name must contain 2 to 160 characters.'
      using errcode = '22023';
  end if;
  if v_version_id not in ('cbse-2026-27-xi-v1', 'cbse-2026-27-xii-v1') then
    raise exception 'Unsupported curriculum version.'
      using errcode = '22023';
  end if;

  select versions.grade
  into v_grade
  from public.curriculum_versions as versions
  where versions.id = v_version_id;
  if v_grade is null then
    raise exception 'Curriculum version was not found.'
      using errcode = '23503';
  end if;

  v_validation := public.validate_recall_subject_combination(p_selections);
  if not (v_validation ->> 'valid')::boolean then
    raise exception 'INVALID_SUBJECT_COMBINATION'
      using errcode = '22023', detail = v_validation::text;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_selections) as entries(value)
    join public.curriculum_subjects as subjects
      on subjects.id = entries.value ->> 'curriculumSubjectId'
    where subjects.curriculum_version_id is distinct from v_version_id
  ) then
    raise exception 'Selected subjects must belong to the chosen curriculum version.'
      using errcode = '23514';
  end if;

  perform 1
  from public.user_academic_profiles
  where user_id = v_user_id
  for update;
  if not found then
    raise exception 'Academic profile not found for the active curriculum.'
      using errcode = '23503';
  end if;

  update public.user_academic_profiles
  set
    grade = v_grade,
    curriculum_version_id = v_version_id
  where user_id = v_user_id;

  update public.user_subjects as existing
  set archived_at = v_completed_at
  where existing.user_id = v_user_id
    and existing.archived_at is null
    and not exists (
      select 1
      from jsonb_array_elements(p_selections) as entries(value)
      where entries.value ->> 'curriculumSubjectId' = existing.curriculum_subject_id
        and (entries.value ->> 'subjectPosition')::smallint = existing.subject_position
        and entries.value ->> 'selectionType' = existing.selection_type
    );

  insert into public.user_subjects (
    user_id,
    curriculum_subject_id,
    subject_position,
    selection_type
  )
  select
    v_user_id,
    entries.value ->> 'curriculumSubjectId',
    (entries.value ->> 'subjectPosition')::smallint,
    entries.value ->> 'selectionType'
  from jsonb_array_elements(p_selections) as entries(value)
  where not exists (
    select 1
    from public.user_subjects as existing
    where existing.user_id = v_user_id
      and existing.curriculum_subject_id = entries.value ->> 'curriculumSubjectId'
      and existing.subject_position = (entries.value ->> 'subjectPosition')::smallint
      and existing.selection_type = entries.value ->> 'selectionType'
      and existing.archived_at is null
  );

  update public.user_subject_migration_candidates as candidates
  set
    resolution_status = case
      when exists (
        select 1
        from jsonb_array_elements(p_selections) as entries(value)
        where entries.value ->> 'curriculumSubjectId' = candidates.curriculum_subject_id
      ) then 'confirmed'
      else 'dismissed'
    end,
    resolved_at = v_completed_at
  where candidates.user_id = v_user_id
    and candidates.resolution_status in ('mapped', 'unresolved');

  update public.user_academic_profiles
  set
    pathway = p_pathway,
    school_name = v_school_name,
    onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, v_completed_at)
  where user_id = v_user_id;

  return jsonb_build_object(
    'userId', v_user_id,
    'pathway', p_pathway,
    'schoolName', v_school_name,
    'curriculumVersionId', v_version_id,
    'grade', v_grade,
    'onboardingCompleted', true,
    'validation', v_validation,
    'subjects', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'curriculumSubjectId', subjects.curriculum_subject_id,
            'subjectPosition', subjects.subject_position,
            'selectionType', subjects.selection_type
          )
          order by subjects.subject_position
        ),
        '[]'::jsonb
      )
      from public.user_subjects as subjects
      where subjects.user_id = v_user_id
        and subjects.archived_at is null
    )
  );
end;
$$;

create function public.save_recall_academic_profile(
  p_pathway text,
  p_school_name text,
  p_selections jsonb,
  p_curriculum_version_id text default 'cbse-2026-27-xi-v1'
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select recall_private.save_recall_academic_profile_impl(
    p_pathway,
    p_school_name,
    p_selections,
    p_curriculum_version_id
  );
$$;

revoke all on function public.save_recall_academic_profile(text, text, jsonb, text)
  from public;
grant execute on function public.save_recall_academic_profile(text, text, jsonb, text)
  to authenticated;
revoke all on function recall_private.save_recall_academic_profile_impl(text, text, jsonb, text)
  from public;
grant execute on function recall_private.save_recall_academic_profile_impl(text, text, jsonb, text)
  to authenticated;

commit;
