import type {
  CurriculumNode,
  CurriculumNodeType,
} from '../../../types.ts'
import { CBSE_2026_27_XI_SUBJECTS_BY_CODE } from './catalogue.ts'

interface OutlineNode {
  type: CurriculumNodeType
  title: string
  page: number
  marks?: number
  children?: readonly OutlineNode[]
}

const unit = (
  title: string,
  page: number,
  children: readonly OutlineNode[] = [],
  marks?: number,
): OutlineNode => ({ type: 'unit', title, page, children, marks })
const book = (
  title: string,
  page: number,
  children: readonly OutlineNode[] = [],
): OutlineNode => ({ type: 'book', title, page, children })
const chapter = (
  title: string,
  page: number,
  children: readonly OutlineNode[] = [],
): OutlineNode => ({ type: 'chapter', title, page, children })
const topic = (title: string, page: number): OutlineNode => ({
  type: 'topic',
  title,
  page,
})
const practical = (title: string, page: number): OutlineNode => ({
  type: 'practical',
  title,
  page,
})
const project = (title: string, page: number): OutlineNode => ({
  type: 'project',
  title,
  page,
})
const assessment = (title: string, page: number, marks?: number): OutlineNode => ({
  type: 'assessment_area',
  title,
  page,
  marks,
})

const reviewedOutlines: Readonly<Record<string, readonly OutlineNode[]>> =
  Object.freeze({
    '301': [
      assessment('Reading Skills', 8),
      assessment('Grammar and Creative Writing Skills', 8),
      book('Hornbill', 9, [
        chapter('The Portrait of a Lady', 9, [
          topic('Character sketch and relationships', 9),
          topic('Themes of loss, companionship, and change', 9),
        ]),
        chapter("We're Not Afraid to Die... if We Can All Be Together", 9, [
          topic('Narrative of survival at sea', 9),
          topic('Courage, teamwork, and optimism', 9),
        ]),
        chapter('Discovering Tut: the Saga Continues', 9, [
          topic('Archaeology and scientific investigation', 9),
          topic('History, mystery, and heritage', 9),
        ]),
        chapter('The Adventure', 9, [
          topic('Alternate history and scientific imagination', 9),
        ]),
        chapter('Silk Road', 9, [
          topic('Travel writing and cultural encounter', 9),
        ]),
        chapter('A Photograph', 9, [
          topic('Memory, time, and loss in poetry', 9),
        ]),
        chapter('The Laburnum Top', 9, [
          topic('Imagery of stillness and movement', 9),
        ]),
        chapter('The Voice of the Rain', 9, [
          topic('Personification and the water cycle as metaphor', 9),
        ]),
        chapter('Childhood', 9, [
          topic('Innocence, adulthood, and self-awareness', 9),
        ]),
        chapter('Father to Son', 9, [
          topic('Generational gap and communication', 9),
        ]),
      ]),
      book('Snapshots', 9, [
        chapter('The Summer of the Beautiful White Horse', 9, [
          topic('Honesty, adventure, and cultural setting', 9),
        ]),
        chapter('The Address', 9, [
          topic('War, memory, and belonging', 9),
        ]),
        chapter("Mother's Day", 9, [
          topic('Family roles and assertiveness', 9),
        ]),
        chapter('Birth', 9, [
          topic('Medical ethics, duty, and crisis', 9),
        ]),
        chapter('The Tale of Melon City', 9, [
          topic('Satire on justice and governance', 9),
        ]),
      ]),
      assessment('Assessment of Listening and Speaking Skills', 15),
      project('Project Work', 16),
    ],
    '302': [
      assessment('अपठित बोध', 7),
      assessment('अभिव्यक्ति और माध्यम', 7),
      book('आरोह भाग-1', 8),
      book('वितान भाग-1', 8),
      assessment('श्रवण तथा वाचन', 4),
      project('परियोजना कार्य', 5),
    ],
    '027': [
      unit('Themes in World History', 3, [
        chapter('Writing and City Life', 4),
        chapter('An Empire Across Three Continents', 4),
        chapter('Nomadic Empires', 4),
        chapter('The Three Orders', 4),
        chapter('Changing Cultural Traditions', 5),
        chapter('Displacing Indigenous Peoples', 5),
        chapter('Paths to Modernisation', 5),
      ]),
      assessment('Map Work', 5),
      project('Project Work', 6),
    ],
    '028': [
      unit('Indian Constitution at Work', 3, [
        chapter('Constitution: Why and How?', 3),
        chapter('Rights in the Indian Constitution', 3),
        chapter('Election and Representation', 3),
        chapter('Executive', 3),
        chapter('Legislature', 3),
        chapter('Judiciary', 3),
        chapter('Federalism', 3),
        chapter('Local Governments', 3),
        chapter('Constitution as a Living Document', 3),
        chapter('The Philosophy of the Constitution', 3),
      ]),
      unit('Political Theory', 3, [
        chapter('Political Theory: An Introduction', 3),
        chapter('Freedom', 3),
        chapter('Equality', 3),
        chapter('Social Justice', 3),
        chapter('Rights', 3),
        chapter('Citizenship', 3),
        chapter('Nationalism', 3),
        chapter('Secularism', 3),
      ]),
      project('Project Work', 18),
    ],
    '029': [
      book('Fundamentals of Physical Geography', 3, [
        chapter('Geography as a Discipline', 5),
        chapter('The Origin and Evolution of the Earth', 5),
        chapter('Interior of the Earth', 5),
        chapter('Distribution of Oceans and Continents', 5),
        chapter('Geomorphic Processes', 5),
        chapter('Landforms and their Evolution', 5),
        chapter('Composition and Structure of Atmosphere', 6),
        chapter('Solar Radiation, Heat Balance and Temperature', 6),
        chapter('Atmospheric Circulation and Weather Systems', 6),
        chapter('Water in the Atmosphere', 6),
        chapter('World Climate and Climate Change', 6),
        chapter('Water (Oceans)', 6),
        chapter('Movements of Ocean Water', 6),
        chapter('Biodiversity and Conservation', 6),
      ]),
      book('India - Physical Environment', 4, [
        chapter('India - Location', 6),
        chapter('Structure and Physiography', 6),
        chapter('Drainage System', 7),
        chapter('Climate', 7),
        chapter('Natural Vegetation', 7),
        chapter('Natural Hazards and Disasters', 7),
      ]),
      book('Practical Work in Geography Part I', 7, [
        practical('Geography Practical Part I', 7),
      ]),
      assessment('Map Work', 8),
    ],
    '030': [
      unit('Statistics for Economics', 2, [
        chapter('Introduction', 2, [
          topic('What is Economics?', 2),
          topic('Meaning, scope, functions and importance of statistics in Economics', 2),
        ]),
        chapter('Collection, Organisation and Presentation of Data', 2, [
          topic('Collection of data', 2),
          topic('Organisation of data', 2),
          topic('Presentation of data', 3),
        ]),
        chapter('Statistical Tools and Interpretation', 3, [
          topic('Measures of Central Tendency', 3),
          topic('Correlation', 3),
          topic('Index Numbers', 3),
        ]),
      ], 40),
      unit('Introductory Microeconomics', 3, [
        chapter('Introduction', 3),
        chapter("Consumer's Equilibrium and Demand", 3),
        chapter('Producer Behaviour and Supply', 4),
        chapter('Perfect Competition - Price Determination and Simple Applications', 4),
      ], 40),
      project('Project in Economics', 4),
    ],
    '037': [
      unit('Understanding Psychology', 2),
      unit('Methods of Enquiry in Psychology', 2),
      unit('Human Development', 3),
      unit('Sensory, Attentional and Perceptual Processes', 3),
      unit('Learning', 4),
      unit('Human Memory', 4),
      unit('Thinking', 4),
      unit('Motivation and Emotion', 5),
      practical('Practical Work', 7),
    ],
    '039': [
      unit('Introducing Sociology', 3, [
        chapter('Sociology, Society and its Relationship with Other Social Sciences', 3),
        chapter('Terms, Concepts and their Use in Sociology', 3),
        chapter('Understanding Social Institutions', 3),
        chapter('Culture and Socialization', 3),
        chapter('Doing Sociology: Research Methods', 3),
      ]),
      unit('Understanding Society', 4, [
        chapter('Social Structure, Stratification and Social Processes in Society', 4),
        chapter('Social Change and Social Order in Rural and Urban Society', 4),
        chapter('Environment and Society', 4),
        chapter('Introducing Western Sociologists', 4),
        chapter('Indian Sociologists', 4),
      ]),
      project('Project Work', 4),
    ],
    '041': [
      unit('Sets and Functions', 2, [
        chapter('Sets', 2),
        chapter('Relations and Functions', 2),
        chapter('Trigonometric Functions', 2),
      ], 23),
      unit('Algebra', 3, [
        chapter('Complex Numbers and Quadratic Equations', 3),
        chapter('Linear Inequalities', 3),
        chapter('Permutations and Combinations', 3),
        chapter('Binomial Theorem', 3),
        chapter('Sequence and Series', 3),
      ], 25),
      unit('Coordinate Geometry', 3, [
        chapter('Straight Lines', 3),
        chapter('Conic Sections', 3),
        chapter('Introduction to Three-dimensional Geometry', 3),
      ], 12),
      unit('Calculus', 4, [
        chapter('Limits and Derivatives', 4),
      ], 8),
      unit('Statistics and Probability', 4, [
        chapter('Statistics', 4),
        chapter('Probability', 4),
      ], 12),
    ],
    '241': [
      unit('Numbers, Quantification and Numerical Applications', 3),
      unit('Algebra', 4),
      unit('Calculus', 6),
      unit('Permutations and Combinations and Probability', 6),
      unit('Descriptive Statistics', 7),
      unit('Financial Mathematics', 8),
      unit('Coordinate Geometry', 8),
      practical('Practical and Project Work', 10),
    ],
    '042': [
      unit('Physical World and Measurement', 2, [
        chapter('Units and Measurements', 2),
      ]),
      unit('Kinematics', 2, [
        chapter('Motion in a Straight Line', 2),
        chapter('Motion in a Plane', 2),
      ]),
      unit('Laws of Motion', 2, [chapter('Laws of Motion', 2)]),
      unit('Work, Energy and Power', 2, [chapter('Work, Energy and Power', 2)]),
      unit('Motion of System of Particles and Rigid Body', 2, [
        chapter('System of Particles and Rotational Motion', 2),
      ]),
      unit('Gravitation', 2, [chapter('Gravitation', 2)]),
      unit('Properties of Bulk Matter', 2, [
        chapter('Mechanical Properties of Solids', 2),
        chapter('Mechanical Properties of Fluids', 2),
        chapter('Thermal Properties of Matter', 2),
      ]),
      unit('Thermodynamics', 2, [chapter('Thermodynamics', 2)]),
      unit('Behaviour of Perfect Gases and Kinetic Theory of Gases', 2, [
        chapter('Kinetic Theory', 2),
      ]),
      unit('Oscillations and Waves', 2, [
        chapter('Oscillations', 2),
        chapter('Waves', 2),
      ]),
      practical('Practical Work', 7),
    ],
    '043': [
      unit('Some Basic Concepts of Chemistry', 2),
      unit('Structure of Atom', 2),
      unit('Classification of Elements and Periodicity in Properties', 2),
      unit('Chemical Bonding and Molecular Structure', 2),
      unit('Thermodynamics', 3),
      unit('Equilibrium', 3),
      unit('Redox Reactions', 3),
      unit('Organic Chemistry - Some Basic Principles and Techniques', 3),
      unit('Hydrocarbons', 3),
      practical('Practical Work', 4),
      project('Project Work', 4),
    ],
    '044': [
      unit('Diversity of Living Organisms', 3, [
        chapter('The Living World', 3),
        chapter('Biological Classification', 3),
        chapter('Plant Kingdom', 3),
        chapter('Animal Kingdom', 3),
      ]),
      unit('Structural Organization in Plants and Animals', 3, [
        chapter('Morphology of Flowering Plants', 3),
        chapter('Anatomy of Flowering Plants', 4),
        chapter('Structural Organisation in Animals', 4),
      ]),
      unit('Cell: Structure and Function', 4, [
        chapter('Cell - The Unit of Life', 4),
        chapter('Biomolecules', 4),
        chapter('Cell Cycle and Cell Division', 4),
      ]),
      unit('Plant Physiology', 4, [
        chapter('Photosynthesis in Higher Plants', 4),
        chapter('Respiration in Plants', 4),
        chapter('Plant Growth and Development', 4),
      ]),
      unit('Human Physiology', 5, [
        chapter('Breathing and Exchange of Gases', 5),
        chapter('Body Fluids and Circulation', 5),
        chapter('Excretory Products and their Elimination', 5),
        chapter('Locomotion and Movement', 5),
        chapter('Neural Control and Coordination', 5),
        chapter('Chemical Coordination and Integration', 5),
      ]),
      practical('Practical Work', 6),
    ],
    '048': [
      unit('Changing Trends and Career in Physical Education', 3),
      unit('Olympism Value Education', 3),
      unit('Yoga', 3),
      unit('Physical Education and Sports for CWSN', 3),
      unit('Physical Fitness, Wellness and Lifestyle', 3),
      unit('Test, Measurement and Evaluation', 3),
      unit('Fundamentals of Anatomy and Physiology in Sports', 3),
      unit('Fundamentals of Kinesiology and Biomechanics in Sports', 3),
      unit('Psychology and Sports', 3),
      unit('Training and Doping in Sports', 3),
      practical('Practical Work', 11),
    ],
    '054': [
      unit('Foundations of Business', 2, [
        chapter('Evolution and Fundamentals of Business', 2),
        chapter('Forms of Business Organisations', 3),
        chapter('Public, Private and Global Enterprises', 4),
        chapter('Business Services', 4),
        chapter('Emerging Modes of Business', 5),
        chapter('Social Responsibility of Business and Business Ethics', 5),
      ], 40),
      unit('Finance and Trade', 5, [
        chapter('Sources of Business Finance', 5),
        chapter('Small Business and Enterprises', 6),
        chapter('Internal Trade', 6),
        chapter('International Trade', 6),
      ], 40),
      project('Project Work', 7),
    ],
    '055': [
      unit('Theoretical Framework', 2, [
        topic('Introduction to Accounting', 2),
        topic('Theory Base of Accounting', 2),
      ], 12),
      unit('Accounting Process', 3, [
        topic('Recording of Business Transactions', 3),
        topic('Bank Reconciliation Statement', 3),
        topic('Depreciation, Provisions and Reserves', 3),
        topic('Trial Balance and Rectification of Errors', 4),
      ], 44),
      unit('Financial Statements of Sole Proprietorship', 5, [
        topic('Financial Statements', 5),
        topic('Incomplete Records', 5),
      ], 24),
      project('Project Work', 6),
    ],
    '083': [
      unit('Computer Systems and Organisation', 1),
      unit('Computational Thinking and Programming - I', 2),
      unit('Society, Law and Ethics', 3),
      practical('Practical Work', 4),
    ],
    '074': [
      unit('Introduction to Political Institutions', 3),
      unit('Basic Features of the Constitution of India', 3),
      unit('Jurisprudence, Nature and Sources of Law', 4),
      unit('Judiciary: Constitutional, Civil and Criminal Courts and Processes', 4),
      unit('Family Justice System', 5),
      project('Project Work', 5),
    ],
    '843': [
      unit('Introduction: Artificial Intelligence for Everyone', 2),
      unit('Unlocking Your Future in AI', 2),
      unit('Python Programming', 2),
      unit('Introduction to Capstone Project', 2),
      unit('Data Literacy - Data Collection to Data Analysis', 2),
      unit('Machine Learning Algorithms', 2),
      unit('Leveraging Linguistics and Computer Science', 2),
      unit('AI Ethics and Values', 2),
      practical('Practical Work', 2),
      project('Capstone Project', 2),
    ],
    '118': [
      assessment('Comprehension / Reading', 2, 20),
      assessment('Writing Skills / Composition', 2, 20),
      assessment('Applied Grammar', 3, 25),
      assessment('Culture', 3, 15),
      book('Cours de Langue et de Civilisation Françaises – II (G. Mauger)', 4, [
        chapter('Lessons 1-12', 4, [
          topic('Seen and unseen comprehension', 4),
          topic('Creative writing and informal letter', 4),
          topic('Prepositions, pronouns and tenses', 4),
          topic('Culture questions from Lessons 1-12', 4),
        ]),
      ]),
      assessment('Internal Assessment', 5, 20),
      project('Project Work', 5),
    ],
    '034': [
      unit('Basic Musical Concepts', 2, [
        topic('Nada, Shruti, Swar, Saptak, Thaat, Jati, Laya, Tala', 2),
        topic('Margi-Desi Sangeet and Raga', 2),
      ], 6),
      unit('Brief History of Vocal Forms', 3, [
        topic('Dhrupad, Khayal and Tarana', 3),
      ], 6),
      unit('Textual and Historical Study', 3, [
        topic('Musical elements in Natya Shastra', 3),
        topic('Life sketch and contribution of Tansen, V.N. Bhatkhande and V.D. Paluskar', 3),
      ], 6),
      unit('Talas and Tanpura', 4, [
        topic('Teentala, Ektala and Chautala with Thah, Dugun and Chaugun', 4),
        topic('Structure of Tanpura', 4),
      ], 6),
      unit('Prescribed Ragas', 4, [
        chapter('Bihag', 4),
        chapter('Bhimpalasi', 4),
        chapter('Bhairavi', 4),
      ], 6),
      practical('Practical Work', 5),
    ],
    '049': [
      unit('Pre-Historic Rock Paintings and Art of Indus Valley Civilization', 2, [
        topic('Pre-historic rock paintings and Wizard\'s Dance, Bhimbetka', 2),
        topic('Indus / Sindhu-Saraswati Civilization sculptures and seals', 2),
        topic('Buddhist, Jain and Hindu Art (3rd century B.C. to 8th century A.D.)', 3),
      ], 15),
      unit('Temple Sculptures, Bronzes and Indo-Islamic Architecture', 3, [
        topic('Temple sculpture overview (6th to 13th century CE)', 3),
        topic('Indian bronzes and Nataraja', 4),
        topic('Artistic aspects of Indo-Islamic architecture', 4),
      ], 15),
      practical('Nature and Object Study', 5),
      practical('Painting Composition', 5),
      assessment('Portfolio Assessment', 5),
    ],
    '066': [
      unit('Entrepreneurship: Concept and Functions', 2, [], 15),
      unit('An Entrepreneur', 2),
      unit('Entrepreneurial Journey', 3),
      unit('Entrepreneurship as Innovation and Problem Solving', 3, [], 20),
      unit('Understanding the Market', 4, [], 15),
      unit('Business Finance and Arithmetic', 4),
      unit('Resource Mobilization', 5, [], 20),
      project('Project Work', 5),
    ],
    '837': [
      unit('Communication Skills-III', 2),
      unit('Self-Management Skills-III', 2),
      unit('ICT Skills-III', 2),
      unit('Entrepreneurial Skills-III', 2),
      unit('Green Skills-III', 2),
      unit('Overview of Fashion', 3),
      unit('Introduction to Fabrics, Dyeing and Printing', 3),
      unit('Design Fundamentals', 4),
      unit('Materials, Tools and Processes of Product Making', 4),
      practical('Practical Work', 5),
      project('Project Work / Field Visit', 5),
    ],
  })

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('en-IN')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function flattenOutline(
  subjectId: string,
  sourceUrl: string,
  nodes: readonly OutlineNode[],
  parentId: string | null = null,
  parentKey = '',
): CurriculumNode[] {
  return nodes.flatMap((entry, index) => {
    const externalKey = [
      subjectId,
      parentKey,
      entry.type,
      String(index + 1).padStart(2, '0'),
      slug(entry.title),
    ].filter(Boolean).join(':')
    const id = `node-${externalKey}`
    const node: CurriculumNode = Object.freeze({
      id,
      subjectId,
      parentId,
      nodeType: entry.type,
      title: entry.title,
      description: null,
      officialOrder: index + 1,
      marksWeightage: entry.marks ?? null,
      sourcePage: entry.page,
      sourceUrl,
      externalKey,
      active: true,
    })
    return [
      node,
      ...flattenOutline(
        subjectId,
        sourceUrl,
        entry.children || [],
        id,
        externalKey,
      ),
    ]
  })
}

export const CBSE_2026_27_XI_NODES: readonly CurriculumNode[] =
  Object.freeze(
    Object.entries(reviewedOutlines).flatMap(([subjectCode, nodes]) => {
      const subject = CBSE_2026_27_XI_SUBJECTS_BY_CODE.get(subjectCode)
      if (!subject) {
        throw new Error(`Reviewed outline references unknown subject code ${subjectCode}.`)
      }
      return flattenOutline(subject.id, subject.source.url, nodes)
    }),
  )

export const CBSE_2026_27_XI_NODES_BY_SUBJECT = new Map(
  [...CBSE_2026_27_XI_SUBJECTS_BY_CODE.values()].map((subject) => [
    subject.id,
    CBSE_2026_27_XI_NODES.filter((node) => node.subjectId === subject.id),
  ]),
)

export const CBSE_2026_27_XI_REVIEWED_SUBJECT_CODES =
  Object.freeze(Object.keys(reviewedOutlines))
