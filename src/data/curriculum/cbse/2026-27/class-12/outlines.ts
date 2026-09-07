import type {
  CurriculumNode,
  CurriculumNodeType,
} from '../../../types.ts'
import { CBSE_2026_27_XII_SUBJECTS_BY_CODE } from './catalogue.ts'

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

/** Class XII outlines from CBSE Sec Part II 2026-27 / NCERT Class 12 books. */
const reviewedOutlines: Readonly<Record<string, readonly OutlineNode[]>> =
  Object.freeze({
    '301': [
      assessment('Reading Skills', 8),
      assessment('Creative Writing Skills', 8),
      book('Flamingo', 9, [
        chapter('The Last Lesson', 9, [
          topic('Linguistic chauvinism and cultural identity', 9),
        ]),
        chapter('Lost Spring', 9, [
          topic('Poverty, childhood, and social inequality', 9),
        ]),
        chapter('Deep Water', 9, [
          topic('Fear, courage, and overcoming trauma', 9),
        ]),
        chapter('The Rattrap', 9, [
          topic('Human nature, kindness, and redemption', 9),
        ]),
        chapter('Indigo', 9, [
          topic('Gandhian leadership and peasant rights', 9),
        ]),
        chapter('Poets and Pancakes', 9, [
          topic('Studio culture and satire', 9),
        ]),
        chapter('The Interview', 9, [
          topic('Media, celebrity, and communication', 9),
        ]),
        chapter('Going Places', 9, [
          topic('Adolescent fantasy and social reality', 9),
        ]),
        chapter('My Mother at Sixty-Six', 9, [
          topic('Ageing, separation, and filial love', 9),
        ]),
        chapter('Keeping Quiet', 9, [
          topic('Silence, introspection, and peace', 9),
        ]),
        chapter('A Thing of Beauty', 9, [
          topic('Beauty as lasting joy', 9),
        ]),
        chapter('A Roadside Stand', 9, [
          topic('Rural poverty and urban indifference', 9),
        ]),
        chapter('Aunt Jennifer\'s Tigers', 9, [
          topic('Gender, art, and oppression', 9),
        ]),
      ]),
      book('Vistas', 9, [
        chapter('The Third Level', 9),
        chapter('The Tiger King', 9),
        chapter('Journey to the End of the Earth', 9),
        chapter('The Enemy', 9),
        chapter('On the Face of It', 9),
        chapter('Memories of Childhood', 9),
      ]),
      assessment('Assessment of Listening and Speaking Skills', 15),
      project('Project Work', 16),
    ],
    '302': [
      assessment('अपठित बोध', 7),
      assessment('अभिव्यक्ति और माध्यम', 7),
      book('आरोह भाग-2', 8),
      book('वितान भाग-2', 8),
      assessment('श्रवण तथा वाचन', 4),
      project('परियोजना कार्य', 5),
    ],
    '027': [
      book('Themes in Indian History Part I', 3, [
        chapter('Bricks, Beads and Bones', 4),
        chapter('Kings, Farmers and Towns', 4),
        chapter('Kinship, Caste and Class', 4),
        chapter('Thinkers, Beliefs and Buildings', 4),
      ]),
      book('Themes in Indian History Part II', 4, [
        chapter('Through the Eyes of Travellers', 5),
        chapter('Bhakti-Sufi Traditions', 5),
        chapter('An Imperial Capital: Vijayanagara', 5),
        chapter('Peasants, Zamindars and the State', 5),
      ]),
      book('Themes in Indian History Part III', 5, [
        chapter('Colonialism and the Countryside', 6),
        chapter('Rebels and the Raj', 6),
        chapter('Mahatma Gandhi and the Nationalist Movement', 6),
        chapter('Framing the Constitution', 6),
      ]),
      assessment('Map Work', 6),
      project('Project Work', 7),
    ],
    '028': [
      unit('Contemporary World Politics', 3, [
        chapter('The End of Bipolarity', 3),
        chapter('Contemporary Centres of Power', 3),
        chapter('Contemporary South Asia', 3),
        chapter('International Organisations', 4),
        chapter('Security in the Contemporary World', 4),
        chapter('Environment and Natural Resources', 4),
        chapter('Globalisation', 4),
      ]),
      unit('Politics in India Since Independence', 5, [
        chapter('Challenges of Nation-Building', 5),
        chapter('Era of One-Party Dominance', 5),
        chapter("Politics of Planned Development", 5),
        chapter("India's External Relations", 6),
        chapter('Challenges to and Restoration of the Congress System', 6),
        chapter('The Crisis of Democratic Order', 6),
        chapter('Regional Aspirations', 6),
        chapter('Recent Developments in Indian Politics', 6),
      ]),
      project('Project Work', 18),
    ],
    '029': [
      book('Fundamentals of Human Geography', 3, [
        chapter('Human Geography: Nature and Scope', 5),
        chapter('The World Population: Distribution, Density and Growth', 5),
        chapter('Human Development', 5),
        chapter('Primary Activities', 5),
        chapter('Secondary Activities', 6),
        chapter('Tertiary and Quaternary Activities', 6),
        chapter('Transport and Communication', 6),
        chapter('International Trade', 6),
      ]),
      book('India - People and Economy', 4, [
        chapter('Population: Distribution, Density, Growth and Composition', 6),
        chapter('Human Settlements', 6),
        chapter('Land Resources and Agriculture', 7),
        chapter('Water Resources', 7),
        chapter('Mineral and Energy Resources', 7),
        chapter('Planning and Sustainable Development in Indian Context', 7),
        chapter('Transport and Communication', 7),
        chapter('International Trade', 7),
        chapter('Geographical Perspective on Selected Issues and Problems', 7),
      ]),
      book('Practical Work in Geography Part II', 7, [
        practical('Geography Practical Part II', 7),
      ]),
      assessment('Map Work', 8),
    ],
    '030': [
      unit('Introductory Macroeconomics', 2, [
        chapter('National Income and Related Aggregates', 2),
        chapter('Money and Banking', 3),
        chapter('Determination of Income and Employment', 3),
        chapter('Government Budget and the Economy', 3),
        chapter('Balance of Payments', 4),
      ], 40),
      unit('Indian Economic Development', 4, [
        chapter('Indian Economy on the Eve of Independence', 4),
        chapter('Indian Economy 1950-1990', 4),
        chapter('Liberalisation, Privatisation and Globalisation: An Appraisal', 5),
        chapter('Human Capital Formation in India', 5),
        chapter('Rural Development', 5),
        chapter('Employment: Growth, Informalisation and Other Issues', 5),
        chapter('Environment and Sustainable Development', 6),
        chapter('Comparative Development Experiences of India and its Neighbours', 6),
      ], 40),
      project('Project in Economics', 6),
    ],
    '037': [
      unit('Variations in Psychological Attributes', 2),
      unit('Self and Personality', 3),
      unit('Meeting Life Challenges', 3),
      unit('Psychological Disorders', 4),
      unit('Therapeutic Approaches', 4),
      unit('Attitude and Social Cognition', 5),
      unit('Social Influence and Group Processes', 5),
      practical('Practical Work', 7),
    ],
    '039': [
      unit('Indian Society', 3, [
        chapter('Introducing Indian Society', 3),
        chapter('The Demographic Structure of the Indian Society', 3),
        chapter('Social Institutions: Continuity and Change', 3),
        chapter('Patterns of Social Inequality and Exclusion', 4),
        chapter('The Challenges of Cultural Diversity', 4),
      ]),
      unit('Social Change and Development in India', 4, [
        chapter('Structural Change', 4),
        chapter('Cultural Change', 5),
        chapter('Change and Development in Rural Society', 5),
        chapter('Change and Development in Industrial Society', 5),
        chapter('Social Movements', 5),
      ]),
      project('Project Work', 5),
    ],
    '041': [
      unit('Relations and Functions', 2, [
        chapter('Relations and Functions', 2),
        chapter('Inverse Trigonometric Functions', 2),
      ], 8),
      unit('Algebra', 3, [
        chapter('Matrices', 3),
        chapter('Determinants', 3),
      ], 10),
      unit('Calculus', 4, [
        chapter('Continuity and Differentiability', 4),
        chapter('Application of Derivatives', 4),
        chapter('Integrals', 5),
        chapter('Application of Integrals', 5),
        chapter('Differential Equations', 5),
      ], 35),
      unit('Vectors and Three-Dimensional Geometry', 6, [
        chapter('Vector Algebra', 6),
        chapter('Three Dimensional Geometry', 6),
      ], 14),
      unit('Linear Programming', 7, [
        chapter('Linear Programming', 7),
      ], 5),
      unit('Probability', 7, [
        chapter('Probability', 7),
      ], 8),
    ],
    '241': [
      unit('Numbers, Quantification and Numerical Applications', 3),
      unit('Algebra', 4),
      unit('Calculus', 5),
      unit('Probability Distributions', 6),
      unit('Inferential Statistics', 7),
      unit('Index Numbers and Time-based Data', 7),
      unit('Financial Mathematics', 8),
      unit('Linear Programming', 8),
      practical('Practical and Project Work', 10),
    ],
    '042': [
      unit('Electrostatics', 2, [
        chapter('Electric Charges and Fields', 2),
        chapter('Electrostatic Potential and Capacitance', 2),
      ]),
      unit('Current Electricity', 3, [
        chapter('Current Electricity', 3),
      ]),
      unit('Magnetic Effects of Current and Magnetism', 3, [
        chapter('Moving Charges and Magnetism', 3),
        chapter('Magnetism and Matter', 3),
      ]),
      unit('Electromagnetic Induction and Alternating Currents', 4, [
        chapter('Electromagnetic Induction', 4),
        chapter('Alternating Current', 4),
      ]),
      unit('Electromagnetic Waves', 4, [
        chapter('Electromagnetic Waves', 4),
      ]),
      unit('Optics', 5, [
        chapter('Ray Optics and Optical Instruments', 5),
        chapter('Wave Optics', 5),
      ]),
      unit('Dual Nature of Radiation and Matter', 6, [
        chapter('Dual Nature of Radiation and Matter', 6),
      ]),
      unit('Atoms and Nuclei', 6, [
        chapter('Atoms', 6),
        chapter('Nuclei', 6),
      ]),
      unit('Electronic Devices', 7, [
        chapter('Semiconductor Electronics: Materials, Devices and Simple Circuits', 7),
      ]),
      practical('Practical Work', 8),
    ],
    '043': [
      unit('Solutions', 2),
      unit('Electrochemistry', 2),
      unit('Chemical Kinetics', 3),
      unit('d-and f-Block Elements', 3),
      unit('Coordination Compounds', 3),
      unit('Haloalkanes and Haloarenes', 4),
      unit('Alcohols, Phenols and Ethers', 4),
      unit('Aldehydes, Ketones and Carboxylic Acids', 4),
      unit('Amines', 5),
      unit('Biomolecules', 5),
      practical('Practical Work', 6),
      project('Project Work', 6),
    ],
    '044': [
      unit('Reproduction', 2, [
        chapter('Sexual Reproduction in Flowering Plants', 2),
        chapter('Human Reproduction', 2),
        chapter('Reproductive Health', 3),
      ]),
      unit('Genetics and Evolution', 3, [
        chapter('Principles of Inheritance and Variation', 3),
        chapter('Molecular Basis of Inheritance', 3),
        chapter('Evolution', 4),
      ]),
      unit('Biology and Human Welfare', 4, [
        chapter('Human Health and Disease', 4),
        chapter('Microbes in Human Welfare', 4),
      ]),
      unit('Biotechnology and its Applications', 5, [
        chapter('Biotechnology: Principles and Processes', 5),
        chapter('Biotechnology and its Applications', 5),
      ]),
      unit('Ecology and Environment', 6, [
        chapter('Organisms and Populations', 6),
        chapter('Ecosystem', 6),
        chapter('Biodiversity and Conservation', 6),
      ]),
      practical('Practical Work', 7),
    ],
    '048': [
      unit('Management of Sporting Events', 2),
      unit('Children and Women in Sports', 3),
      unit('Yoga as Preventive Measure for Lifestyle Disease', 3),
      unit('Physical Education and Sports for CWSN', 4),
      unit('Sports and Nutrition', 4),
      unit('Test and Measurement in Sports', 5),
      unit('Physiology and Injuries in Sports', 5),
      unit('Biomechanics and Sports', 6),
      unit('Psychology and Sports', 6),
      unit('Training in Sports', 7),
      practical('Practical Work', 8),
    ],
    '054': [
      unit('Nature and Significance of Management', 2),
      unit('Principles of Management', 3),
      unit('Business Environment', 3),
      unit('Planning', 4),
      unit('Organising', 4),
      unit('Staffing', 5),
      unit('Directing', 5),
      unit('Controlling', 5),
      unit('Financial Management', 6),
      unit('Financial Markets', 6),
      unit('Marketing Management', 7),
      unit('Consumer Protection', 7),
      project('Project Work', 8),
    ],
    '055': [
      unit('Accounting for Partnership Firms', 2, [
        chapter('Fundamentals of Partnership', 2),
        chapter('Goodwill: Nature and Valuation', 3),
        chapter('Change in Profit Sharing Ratio', 3),
        chapter('Admission of a Partner', 3),
        chapter('Retirement / Death of a Partner', 4),
        chapter('Dissolution of Partnership Firm', 4),
      ]),
      unit('Company Accounts', 5, [
        chapter('Accounting for Share Capital', 5),
        chapter('Issue of Debentures', 5),
      ]),
      unit('Analysis of Financial Statements', 6, [
        chapter('Financial Statements of a Company', 6),
        chapter('Accounting Ratios', 6),
        chapter('Cash Flow Statement', 7),
      ]),
      project('Project Work', 8),
    ],
    '074': [
      unit('Judiciary', 2),
      unit('Topics of Law', 3),
      unit('Arbitration, Tribunal Adjudication and Alternative Dispute Resolution', 4),
      unit('Human Rights in India', 4),
      unit('Legal Profession in India', 5),
      unit('Legal Services', 5),
      unit('International Context', 6),
      project('Project Work', 7),
    ],
    '083': [
      unit('Computational Thinking and Programming - 2', 2, [
        chapter('Revision of Python basics', 2),
        chapter('Functions', 2),
        chapter('File Handling', 3),
        chapter('Data Structures: Stacks using Lists', 3),
      ]),
      unit('Computer Networks', 4, [
        chapter('Evolution of Networking', 4),
        chapter('Data Communication Terminologies', 4),
        chapter('Transmission Media', 4),
        chapter('Network Devices', 4),
        chapter('Network Topologies and Protocols', 5),
      ]),
      unit('Database Management', 5, [
        chapter('Database Concepts', 5),
        chapter('Structured Query Language', 5),
        chapter('Interface of Python with SQL Database', 6),
      ]),
      practical('Practical Work', 7),
    ],
    '843': [
      unit('Capstone Project', 3),
      unit('Model Lifecycle', 4),
      unit('AI Ethics and Values', 5),
      unit('Storytelling through Data', 6),
      practical('Practical Work', 7),
      project('Project Work', 8),
    ],
    '118': [
      assessment('Comprehension / Reading', 2, 20),
      assessment('Writing Skills / Composition', 2, 20),
      assessment('Applied Grammar', 3, 25),
      assessment('Culture', 3, 15),
      book('Cours de Langue et de Civilisation Françaises – II (G. Mauger)', 4, [
        chapter('Lessons 13-23', 4, [
          topic('Seen and unseen comprehension', 4),
          topic('Creative writing and formal communication', 4),
          topic('Advanced grammar and transformation', 4),
          topic('Culture questions from Lessons 13-23', 4),
        ]),
      ]),
      assessment('Internal Assessment', 5, 20),
      project('Project Work', 5),
    ],
    '034': [
      unit('Ornamentation and Musical Concepts', 2, [
        topic('Alankar, Kan, Meend, Khatka, Murki, Gamak', 2),
        topic('Gram, Murchhana, Alap, Tana', 2),
      ], 6),
      unit('Time Theory of Ragas', 3, [
        topic('Historical development of Time Theory of Ragas', 3),
      ], 6),
      unit('Textual Study and Artists', 3, [
        topic('Sangeet Ratnakar and Sangeet Parijat', 3),
        topic('Life sketch and contribution of Faiyaz Khan, Bade Ghulam Ali Khan, Krishna Rao Shankar Pandit', 3),
      ], 6),
      unit('Talas and Tanpura', 4, [
        topic('Jhaptala, Rupak and Dhamar with Thah, Dugun, Tigun and Chaugun', 4),
        topic('Tuning of Tanpura', 4),
      ], 6),
      unit('Prescribed Ragas', 4, [
        chapter('Bhairav', 4),
        chapter('Bageshri', 4),
        chapter('Malkauns', 4),
      ], 6),
      practical('Practical Work', 5),
    ],
    '049': [
      unit('Miniature Paintings', 2, [
        topic('Rajasthani School', 2),
        topic('Pahari School', 2),
        topic('Mughal School', 3),
        topic('Deccan School', 3),
      ], 15),
      unit('Modern Trends in Indian Art', 4, [
        topic('Indian National Flag', 4),
        topic('The Bengal School of Painting', 4),
        topic('Modern Trends in Indian Art: paintings, graphic prints and sculptures', 5),
      ], 15),
      practical('Nature and Object Study', 6),
      practical('Painting Composition', 6),
      assessment('Portfolio Assessment', 6),
    ],
    '066': [
      unit('Entrepreneurial Opportunity', 2, [], 30),
      unit('Entrepreneurial Planning', 2),
      unit('Enterprise Marketing', 3, [], 20),
      unit('Enterprise Growth Strategies', 3),
      unit('Business Arithmetic', 4, [], 20),
      unit('Resource Mobilization', 4),
      project('Project Work', 5),
    ],
    '837': [
      unit('Communication Skills-IV', 2),
      unit('Self-Management Skills-IV', 2),
      unit('ICT Skills-IV', 2),
      unit('Entrepreneurial Skills-IV', 2),
      unit('Green Skills-IV', 2),
      unit('History of Fashion', 3),
      unit('Basic Pattern Development', 3),
      unit('Elements of Fashion', 4),
      unit('Basics of Garment Making', 4),
      practical('Practical Work', 5),
      project('Project Work / Field Visit', 5),
    ],
  })

function slug(value: string): string {
  return value
    .normalize('NFKD')
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

export const CBSE_2026_27_XII_NODES: readonly CurriculumNode[] =
  Object.freeze(
    Object.entries(reviewedOutlines).flatMap(([subjectCode, nodes]) => {
      const subject = CBSE_2026_27_XII_SUBJECTS_BY_CODE.get(subjectCode)
      if (!subject) {
        throw new Error(`Reviewed outline references unknown subject code ${subjectCode}.`)
      }
      return flattenOutline(subject.id, subject.source.url, nodes)
    }),
  )

export const CBSE_2026_27_XII_NODES_BY_SUBJECT = new Map(
  [...CBSE_2026_27_XII_SUBJECTS_BY_CODE.values()].map((subject) => [
    subject.id,
    CBSE_2026_27_XII_NODES.filter((node) => node.subjectId === subject.id),
  ]),
)

export const CBSE_2026_27_XII_REVIEWED_SUBJECT_CODES =
  Object.freeze(Object.keys(reviewedOutlines))
