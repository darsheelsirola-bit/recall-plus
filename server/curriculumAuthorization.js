import { AppError, ERROR_CODES } from './errors.js'
import { getUserScopedSupabaseClient } from './supabase.js'

const CHAPTER_NODE_TYPES = new Set([
  'book',
  'unit',
  'chapter',
  'assessment_area',
  'practical',
  'project',
])

function unavailable(cause) {
  return new AppError('Your curriculum could not be verified right now. Please try again.', {
    code: ERROR_CODES.CURRICULUM_UNAVAILABLE,
    statusCode: 503,
    cause,
    details: { retryable: true },
  })
}

function denied(message = 'That curriculum selection is not active in your account.') {
  return new AppError(message, {
    code: ERROR_CODES.CURRICULUM_ACCESS_DENIED,
    statusCode: 403,
  })
}

function required(message = 'Finish academic setup before using AI generation.') {
  return new AppError(message, {
    code: ERROR_CODES.ACADEMIC_PROFILE_REQUIRED,
    statusCode: 409,
  })
}

function exactRows(rows, expectedIds, idKey = 'id') {
  const expected = new Set(expectedIds)
  const actual = new Set((rows || []).map((row) => row?.[idKey]).filter(Boolean))
  return actual.size === expected.size && [...expected].every((id) => actual.has(id))
}

/**
 * Load the signed-in learner's active subjects and only the official node trees
 * required by the current request. Timetable generation needs subject identity
 * only; quiz and insight generation name the exact subject trees they need.
 */
export async function loadAuthorizedCurriculum(
  user,
  {
    nodeSubjectIds = [],
    includeNodes = true,
  } = {},
  createClient = getUserScopedSupabaseClient,
) {
  if (!user?.id || !user?.accessToken) throw denied()
  const client = createClient(user.accessToken)
  let profileResult
  let selectionsResult
  try {
    ;[profileResult, selectionsResult] = await Promise.all([
      client
        .from('user_academic_profiles')
        .select('user_id, curriculum_version_id, onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle(),
      client
        .from('user_subjects')
        .select('curriculum_subject_id, subject_position, selection_type')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('subject_position'),
    ])
  } catch (error) {
    throw unavailable(error)
  }

  if (profileResult?.error || selectionsResult?.error) {
    throw unavailable(profileResult?.error || selectionsResult?.error)
  }
  if (!profileResult?.data?.onboarding_completed) throw required()

  const selections = Array.isArray(selectionsResult?.data) ? selectionsResult.data : []
  const subjectIds = selections.map((row) => row.curriculum_subject_id)
  if (subjectIds.length < 5 || subjectIds.length > 6 || new Set(subjectIds).size !== subjectIds.length) {
    throw required('Choose 5 or 6 active subjects before using AI generation.')
  }

  const activeSubjectIds = new Set(subjectIds)
  const requestedNodeSubjectIds = [...new Set(nodeSubjectIds)]
  if (requestedNodeSubjectIds.some((subjectId) => !activeSubjectIds.has(subjectId))) {
    throw denied()
  }

  let subjectsResult
  let nodesResult
  try {
    ;[subjectsResult, nodesResult] = await Promise.all([
      client
        .from('curriculum_subjects')
        .select('id, curriculum_version_id, name, short_name, subject_code')
        .in('id', subjectIds)
        .eq('active', true),
      includeNodes && requestedNodeSubjectIds.length
        ? client
          .from('curriculum_nodes')
          .select('id, subject_id, parent_id, node_type, title, official_order')
          .in('subject_id', requestedNodeSubjectIds)
          .eq('active', true)
          .order('official_order')
        : Promise.resolve({ data: [], error: null }),
    ])
  } catch (error) {
    throw unavailable(error)
  }
  if (subjectsResult?.error || nodesResult?.error) {
    throw unavailable(subjectsResult?.error || nodesResult?.error)
  }
  if (!exactRows(subjectsResult?.data, subjectIds)) throw unavailable()

  const subjectsById = new Map(subjectsResult.data.map((subject) => [subject.id, subject]))
  return {
    profile: profileResult.data,
    subjects: selections.map((selection) => ({
      ...subjectsById.get(selection.curriculum_subject_id),
      subjectPosition: selection.subject_position,
      selectionType: selection.selection_type,
    })),
    nodes: Array.isArray(nodesResult?.data) ? nodesResult.data : [],
  }
}

function subjectAndNodes(workspace, curriculumSubjectId) {
  const subject = workspace.subjects.find((item) => item.id === curriculumSubjectId)
  if (!subject) throw denied()
  const nodes = workspace.nodes.filter((node) => node.subject_id === subject.id)
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return { subject, nodes, nodesById }
}

function isDescendantOf(node, ancestorIds, nodesById) {
  let parentId = node?.parent_id
  const visited = new Set()
  while (parentId && !visited.has(parentId)) {
    if (ancestorIds.has(parentId)) return true
    visited.add(parentId)
    parentId = nodesById.get(parentId)?.parent_id
  }
  return false
}

function resolveRequestedNodes(input, workspace) {
  const { subject, nodesById } = subjectAndNodes(workspace, input.curriculumSubjectId)
  const chapters = input.chapterNodeIds.map((id) => nodesById.get(id))
  const topics = input.topicNodeIds.map((id) => nodesById.get(id))
  if (
    chapters.some((node) => !node || !CHAPTER_NODE_TYPES.has(node.node_type))
    || topics.some((node) => !node)
  ) throw denied('One or more requested curriculum nodes are not available for this subject.')

  const chapterIds = new Set(chapters.map((node) => node.id))
  if (topics.some((node) => !isDescendantOf(node, chapterIds, nodesById))) {
    throw denied('Each requested topic must belong to the selected chapter.')
  }
  return { subject, chapters, topics }
}

export function authorizeQuizFromWorkspace(input, workspace) {
  const { subject, chapters, topics } = resolveRequestedNodes(input, workspace)
  return {
    ...input,
    curriculumVersionId: workspace.profile.curriculum_version_id,
    subject: subject.name,
    chapter: chapters.map((node) => node.title).join(', '),
    topic: topics.map((node) => node.title).join(', '),
  }
}

export async function authorizeQuizRequest(user, input) {
  return authorizeQuizFromWorkspace(input, await loadAuthorizedCurriculum(user, {
    nodeSubjectIds: [input.curriculumSubjectId],
  }))
}

export function authorizeTimetableFromWorkspace(profile, workspace) {
  return {
    profile,
    curriculumVersionId: workspace.profile.curriculum_version_id,
    subjects: workspace.subjects.map((subject) => ({
      curriculumSubjectId: subject.id,
      name: subject.name,
    })),
  }
}

export async function authorizeTimetableRequest(user, profile) {
  return authorizeTimetableFromWorkspace(profile, await loadAuthorizedCurriculum(user, {
    includeNodes: false,
  }))
}

function exactOfficialTopic(value, officialTitles) {
  const text = String(value || '').trim()
  return officialTitles.has(text) ? text : null
}

function authorizeInsightContext(context, workspace) {
  const resolved = resolveRequestedNodes({
    curriculumSubjectId: context.curriculumSubjectId,
    chapterNodeIds: [context.chapterNodeId],
    topicNodeIds: context.topicNodeIds,
  }, workspace)
  const officialTitles = new Set(resolved.topics.map((node) => node.title))
  const studiedTopics = context.studiedTopics.map((topic) => exactOfficialTopic(topic, officialTitles))
  const unstudiedTopics = context.unstudiedTopics.map((topic) => exactOfficialTopic(topic, officialTitles))
  const weakTopics = context.weakTopics.map((item) => ({
    ...item,
    topic: exactOfficialTopic(item.topic, officialTitles),
  }))
  if (
    studiedTopics.some((topic) => !topic)
    || unstudiedTopics.some((topic) => !topic)
    || weakTopics.some((item) => !item.topic)
  ) throw denied('Insight evidence must reference official topics in the selected chapter.')

  return {
    ...context,
    curriculumVersionId: workspace.profile.curriculum_version_id,
    subject: resolved.subject.name,
    chapter: resolved.chapters[0].title,
    syllabusTopics: resolved.topics.map((node) => node.title),
    studiedTopics,
    unstudiedTopics,
    weakTopics,
    studySources: context.studySources
      ? { ...context.studySources, subject: resolved.subject.name, chapter: resolved.chapters[0].title }
      : null,
  }
}

export function authorizeInsightsFromWorkspace(input, workspace) {
  return {
    chapterContexts: input.chapterContexts.map((context) => authorizeInsightContext(context, workspace)),
  }
}

export async function authorizeInsightsRequest(user, input) {
  return authorizeInsightsFromWorkspace(input, await loadAuthorizedCurriculum(user, {
    nodeSubjectIds: input.chapterContexts.map((context) => context.curriculumSubjectId),
  }))
}
