import { AiProvider, AiTaskType, PrismaClient } from "@prisma/client";
import { bootstrapAdminUser } from "./admin-user";

const prisma = new PrismaClient();

type KnowledgeNodeSeed = {
  children?: KnowledgeNodeSeed[];
  code: string;
  description: string;
  examExpectation: string;
  title: string;
};

const knowledgeSubjectNodes: KnowledgeNodeSeed[] = [
  {
    code: "SD-K1-CS",
    title: "计算机系统基础知识",
    description: "计算机内数据表示、数学基础、硬件体系结构、软件基础、网络、多媒体等综合知识。",
    examExpectation: "覆盖计算机与软件工程知识科目的系统基础部分。",
    children: [
      {
        code: "SD-K1-CS-DATA",
        title: "数据表示与运算",
        description: "数值表示、非数值表示、二进制运算和逻辑代数基础。",
        examExpectation: "掌握数的机内表示、字符/汉字/声音/图像表示、二进制运算和逻辑运算。"
      },
      {
        code: "SD-K1-CS-MATH",
        title: "应用数学与离散数学",
        description: "数值计算、概率统计、编码、逻辑和运筹基础。",
        examExpectation: "能处理常用数值计算、排列组合、概率统计、命题逻辑、谓词逻辑和基本运筹问题。"
      },
      {
        code: "SD-K1-CS-HARDWARE",
        title: "计算机硬件与体系结构",
        description: "CPU、存储器、I/O、总线、CISC/RISC、流水线、多处理机和并行处理。",
        examExpectation: "理解主要部件的组成、性能、基本工作原理和体系结构分类。"
      },
      {
        code: "SD-K1-CS-STORAGE-RELIABILITY",
        title: "存储系统、可靠性与性能评测",
        description: "虚拟存储、多级存储、RAID、网络存储、容错、可靠性和性能评测。",
        examExpectation: "能分析存储体系、系统可靠性和计算机系统性能评价指标。"
      },
      {
        code: "SD-K1-CS-DSA",
        title: "数据结构与算法",
        description: "线性表、栈、队列、树、图、哈希、排序、查找、递归和算法分析。",
        examExpectation: "熟练掌握常用数据结构、常用算法、算法设计策略和复杂度分析。"
      },
      {
        code: "SD-K1-CS-OS",
        title: "操作系统",
        description: "操作系统概念、处理机管理、存储管理、设备管理、文件管理、作业管理和系统配置。",
        examExpectation: "理解操作系统资源管理机制和常见调度、同步、存储、文件相关问题。"
      },
      {
        code: "SD-K1-CS-LANGUAGE",
        title: "程序设计语言与语言处理程序",
        description: "程序设计语言成分、函数调用机制、汇编、编译、解释系统和语言特点。",
        examExpectation: "理解语言基本成分、语言处理程序原理，并能比较常见程序设计语言特点。"
      },
      {
        code: "SD-K1-CS-DATABASE",
        title: "数据库基础",
        description: "数据库系统概念、关系数据库理论、数据库设计、数据库语言和非关系型数据库等新技术。",
        examExpectation: "熟悉数据库模型、关系理论、SQL、设计方法和数据库新技术基础。"
      },
      {
        code: "SD-K1-CS-NETWORK",
        title: "计算机网络",
        description: "协议体系结构、传输介质、交换技术、网络设备、局域网、Internet、TCP/IP 和网络管理。",
        examExpectation: "熟悉网络基础、TCP/IP 协议族、常见网络设备和简单网络管理。"
      },
      {
        code: "SD-K1-CS-MULTIMEDIA",
        title: "多媒体基础",
        description: "多媒体数据表示、压缩、处理和应用基础。",
        examExpectation: "了解多媒体信息表示、处理和应用相关基础知识。"
      }
    ]
  },
  {
    code: "SD-K1-DEVOPS",
    title: "系统开发和运行知识",
    description: "软件工程、系统分析设计、测试、运行维护、质量管理与评审。",
    examExpectation: "覆盖软件开发、运行和质量管理相关基础知识。",
    children: [
      {
        code: "SD-K1-DEVOPS-SE",
        title: "软件工程基础",
        description: "软件生存周期、过程模型、开发方法、项目管理、工具环境、过程改进和开发文档。",
        examExpectation: "熟悉软件工程、软件过程改进和软件开发项目管理基础。"
      },
      {
        code: "SD-K1-DEVOPS-ANALYSIS",
        title: "系统分析基础",
        description: "系统分析方法、模型和需求表达。",
        examExpectation: "能理解系统分析方法与模型，并将需求转化为分析产物。"
      },
      {
        code: "SD-K1-DEVOPS-DESIGN",
        title: "系统设计基础",
        description: "系统设计基本原理、软件体系结构和系统设计模型。",
        examExpectation: "掌握系统设计原则、体系结构概念和常见设计模型。"
      },
      {
        code: "SD-K1-DEVOPS-TEST",
        title: "软件测试基础",
        description: "测试概念、测试阶段、测试方法和测试用例设计。",
        examExpectation: "能判断测试阶段、测试方法和测试用例设计思路。"
      },
      {
        code: "SD-K1-DEVOPS-OPERATION",
        title: "系统运行与维护",
        description: "系统维护、系统转换和系统评价。",
        examExpectation: "了解系统交付后的维护、转换和评价活动。"
      },
      {
        code: "SD-K1-DEVOPS-QUALITY",
        title: "软件质量管理",
        description: "软件质量特性、质量保证、McCabe 度量、软件评审和容错技术。",
        examExpectation: "理解质量模型、复杂度度量、质量保证、评审和容错基础。"
      }
    ]
  },
  {
    code: "SD-K1-OO",
    title: "面向对象基础知识",
    description: "面向对象概念、分析设计、模式、程序设计和测试。",
    examExpectation: "掌握面向对象分析、设计、实现和测试的基础方法。",
    children: [
      {
        code: "SD-K1-OO-CONCEPTS",
        title: "面向对象基本概念",
        description: "对象、类、封装、继承、多态、消息和接口等概念。",
        examExpectation: "能解释面向对象核心概念及其在设计中的作用。"
      },
      {
        code: "SD-K1-OO-ANALYSIS-DESIGN",
        title: "面向对象分析与设计",
        description: "面向对象分析、面向对象设计和模型转换。",
        examExpectation: "能根据需求识别对象、类、关系和职责。"
      },
      {
        code: "SD-K1-OO-PATTERNS",
        title: "分析模式与设计模式",
        description: "常见分析模式和设计模式的意图、结构和适用场景。",
        examExpectation: "能识别常见设计模式并判断其适用问题。"
      },
      {
        code: "SD-K1-OO-PROGRAMMING-TEST",
        title: "面向对象程序设计与测试",
        description: "C++/Java 面向对象程序设计基础和面向对象测试。",
        examExpectation: "熟悉面向对象语言特性、程序结构和测试关注点。"
      }
    ]
  },
  {
    code: "SD-K1-SECURITY",
    title: "网络与信息安全知识",
    description: "信息安全基础、密码技术、认证、数字签名、摘要、网络安全和法规。",
    examExpectation: "能区分加密、认证、数字签名、摘要等安全机制并理解网络安全基础。",
    children: [
      {
        code: "SD-K1-SECURITY-CRYPTO",
        title: "信息安全与密码技术",
        description: "信息安全目标、加密与解密、认证、数字签名和摘要。",
        examExpectation: "掌握常见密码技术与身份认证、完整性、不可否认性等目标的对应关系。"
      },
      {
        code: "SD-K1-SECURITY-NET-LAW",
        title: "网络安全与安全法规",
        description: "网络安全技术、计算机安全等级和相关法律法规。",
        examExpectation: "了解网络安全防护技术、安全等级保护和法律法规基础。"
      }
    ]
  },
  {
    code: "SD-K1-STD-IP",
    title: "标准化、信息化和知识产权",
    description: "标准化、信息化、互联网法规、个人信息保护和知识产权基础。",
    examExpectation: "了解常用信息技术标准、信息化基础、安全与法律法规基础。",
    children: [
      {
        code: "SD-K1-STD-IP-STANDARD",
        title: "标准化基础",
        description: "常用标准体系、标准化基础概念和相关信息技术标准。",
        examExpectation: "能识别标准化活动、标准层级和常见 IT 标准。"
      },
      {
        code: "SD-K1-STD-IP-INFORMATIZATION",
        title: "信息化基础",
        description: "全球信息化趋势、国家和企业信息化、互联网法规、个人信息保护、电子商务和电子政务。",
        examExpectation: "了解信息化战略、互联网相关法规、个人信息保护和典型信息化应用。"
      },
      {
        code: "SD-K1-STD-IP-IPR",
        title: "知识产权基础",
        description: "著作权、专利、商标、商业秘密和软件相关知识产权保护。",
        examExpectation: "了解软件开发和使用中的知识产权法律法规基础。"
      }
    ]
  },
  {
    code: "SD-K1-NEW-TRENDS",
    title: "软件开发新进展",
    description: "软件开发新技术、云计算、大数据和应用领域进展。",
    examExpectation: "了解软件开发技术演进及云计算、大数据等应用趋势。"
  },
  {
    code: "SD-K1-ENGLISH",
    title: "计算机专业英语",
    description: "计算机领域英文资料阅读和术语理解。",
    examExpectation: "具备工程师所要求的英文阅读水平，理解本领域英语术语。"
  }
];

const designSubjectNodes: KnowledgeNodeSeed[] = [
  {
    code: "SD-K2-STRUCTURED",
    title: "结构化分析与设计",
    description: "需求分析、数据流图、数据字典、加工逻辑和数据流图变换。",
    examExpectation: "能完成结构化分析与设计相关案例题。",
    children: [
      {
        code: "SD-K2-STRUCTURED-REQ",
        title: "需求分析",
        description: "需求获取、需求分析、需求建模和规格说明。",
        examExpectation: "能从题干中提取需求并形成结构化需求表达。"
      },
      {
        code: "SD-K2-STRUCTURED-DFD",
        title: "数据流图",
        description: "DFD 元素、层次分解、平衡原则和缺失数据流补全。",
        examExpectation: "能阅读、补全和检查数据流图。"
      },
      {
        code: "SD-K2-STRUCTURED-DD",
        title: "数据字典与加工逻辑",
        description: "数据字典条目、数据结构描述、加工逻辑和判定表/判定树。",
        examExpectation: "能根据 DFD 编写或补充数据字典和加工逻辑。"
      },
      {
        code: "SD-K2-STRUCTURED-TRANSFORM",
        title: "数据流图变换",
        description: "事务分析、变换分析和结构图映射。",
        examExpectation: "能将分析模型转换为结构化设计模型。"
      }
    ]
  },
  {
    code: "SD-K2-OOAD",
    title: "面向对象分析与设计",
    description: "UML、用例需求描述、软件建模和设计模式应用。",
    examExpectation: "能完成面向对象建模、类设计和模式应用相关案例题。",
    children: [
      {
        code: "SD-K2-OOAD-UML",
        title: "统一建模语言 UML",
        description: "用例图、类图、顺序图、状态图、活动图等 UML 图的语义。",
        examExpectation: "能识别 UML 图元素、关系和约束，并补全模型。"
      },
      {
        code: "SD-K2-OOAD-USECASE",
        title: "基于用例的需求描述",
        description: "参与者、用例、用例关系和用例规约。",
        examExpectation: "能从场景中抽取参与者、用例和用例间关系。"
      },
      {
        code: "SD-K2-OOAD-MODELING",
        title: "软件建模",
        description: "静态模型、动态模型、领域模型和设计模型。",
        examExpectation: "能根据需求建立类、接口、交互和状态相关模型。"
      },
      {
        code: "SD-K2-OOAD-PATTERN",
        title: "设计模式应用",
        description: "创建型、结构型、行为型设计模式及其代码结构。",
        examExpectation: "能根据设计问题选择模式并补全关键类或代码。"
      }
    ]
  },
  {
    code: "SD-K2-DB-DESIGN",
    title: "数据库应用分析与设计",
    description: "E-R 模型、关系模式设计、SQL 和数据库访问。",
    examExpectation: "能完成数据库设计与 SQL 应用相关案例题。",
    children: [
      {
        code: "SD-K2-DB-ER",
        title: "E-R 模型",
        description: "实体、属性、联系、基数约束和 E-R 图转换。",
        examExpectation: "能根据业务描述建立或补全 E-R 模型。"
      },
      {
        code: "SD-K2-DB-RELATION",
        title: "关系模式设计",
        description: "函数依赖、范式、模式分解和完整性约束。",
        examExpectation: "能判断范式、分析函数依赖并设计关系模式。"
      },
      {
        code: "SD-K2-DB-SQL",
        title: "数据库语言 SQL",
        description: "数据定义、查询、连接、聚合、子查询和更新语句。",
        examExpectation: "能阅读和补写常用 SQL 语句。"
      },
      {
        code: "SD-K2-DB-ACCESS",
        title: "数据库访问",
        description: "应用程序访问数据库、事务和数据一致性基础。",
        examExpectation: "理解应用系统中的数据库访问流程和事务控制。"
      }
    ]
  },
  {
    code: "SD-K2-IMPLEMENTATION",
    title: "软件实现",
    description: "算法设计与分析、C 语言程序设计和 C++/Java 面向对象程序设计。",
    examExpectation: "能完成算法分析、程序填空和面向对象程序设计相关案例题。",
    children: [
      {
        code: "SD-K2-IMPL-ALGORITHM",
        title: "算法设计与分析",
        description: "常用算法设计策略、算法正确性和复杂度分析。",
        examExpectation: "能分析算法时间/空间复杂度并补全关键逻辑。"
      },
      {
        code: "SD-K2-IMPL-C",
        title: "C 语言程序设计",
        description: "C 语言控制结构、函数、数组、指针、结构体和文件基础。",
        examExpectation: "能阅读、分析和补写 C 程序。"
      },
      {
        code: "SD-K2-IMPL-OOP",
        title: "C++/Java 面向对象程序设计",
        description: "类、继承、多态、接口、异常和集合等面向对象程序结构。",
        examExpectation: "能阅读和补全面向对象程序代码。"
      }
    ]
  },
  {
    code: "SD-K2-TEST",
    title: "软件测试",
    description: "单元测试、集成测试、系统测试、测试方法和测试用例。",
    examExpectation: "能设计测试用例并判断测试阶段与测试方法。",
    children: [
      {
        code: "SD-K2-TEST-STAGES",
        title: "单元、集成与系统测试",
        description: "不同测试阶段的目标、对象和进入/退出条件。",
        examExpectation: "能区分单元测试、集成测试、系统测试和验收测试。"
      },
      {
        code: "SD-K2-TEST-CASES",
        title: "测试方法和测试用例",
        description: "黑盒测试、白盒测试、边界值、等价类、路径覆盖和用例设计。",
        examExpectation: "能根据需求或代码设计有效测试用例。"
      }
    ]
  },
  {
    code: "SD-K2-REVIEW",
    title: "软件评审",
    description: "软件设计评审和程序设计评审。",
    examExpectation: "能识别设计和代码评审关注点，判断评审发现的问题。",
    children: [
      {
        code: "SD-K2-REVIEW-DESIGN",
        title: "软件设计评审",
        description: "架构、接口、模块划分、数据设计和可维护性评审。",
        examExpectation: "能评价设计方案是否满足质量和约束要求。"
      },
      {
        code: "SD-K2-REVIEW-PROGRAM",
        title: "程序设计评审",
        description: "代码结构、复杂度、可读性、异常处理和缺陷检查。",
        examExpectation: "能识别程序设计与实现中的缺陷和改进点。"
      }
    ]
  }
];

async function main() {
  await bootstrapAdminUser(prisma);
  await seedAiPresets();

  const program = await prisma.examProgram.upsert({
    where: { slug: "ruankao" },
    update: {
      name: "软考",
      description: "中国计算机技术与软件专业技术资格"
    },
    create: {
      name: "软考",
      slug: "ruankao",
      description: "中国计算机技术与软件专业技术资格"
    }
  });

  const track = await prisma.examTrack.upsert({
    where: { programId_slug: { programId: program.id, slug: "software-designer" } },
    update: {
      name: "软件设计师",
      level: "中级"
    },
    create: {
      programId: program.id,
      name: "软件设计师",
      slug: "software-designer",
      level: "中级"
    }
  });

  const cycle = await prisma.examCycle.upsert({
    where: { trackId_slug: { trackId: track.id, slug: "2026-h1" } },
    update: {
      name: "2026 上半年"
    },
    create: {
      trackId: track.id,
      name: "2026 上半年",
      slug: "2026-h1"
    }
  });

  const knowledgeSubject = await prisma.subject.upsert({
    where: { cycleId_slug: { cycleId: cycle.id, slug: "basic-knowledge" } },
    update: {
      name: "基础知识",
      description: "软件设计师基础知识科目，对应大纲科目 1：计算机与软件工程知识"
    },
    create: {
      cycleId: cycle.id,
      name: "基础知识",
      slug: "basic-knowledge",
      description: "软件设计师基础知识科目，对应大纲科目 1：计算机与软件工程知识"
    }
  });

  const designSubject = await prisma.subject.upsert({
    where: { cycleId_slug: { cycleId: cycle.id, slug: "application-technology" } },
    update: {
      name: "应用技术",
      description: "软件设计师应用技术科目，对应大纲科目 2：软件设计"
    },
    create: {
      cycleId: cycle.id,
      name: "应用技术",
      slug: "application-technology",
      description: "软件设计师应用技术科目，对应大纲科目 2：软件设计"
    }
  });

  const knowledgeSyllabus = await prisma.syllabus.upsert({
    where: { subjectId_version: { subjectId: knowledgeSubject.id, version: "mvp" } },
    update: {
      name: "软件设计师 2018 审定版大纲：基础知识"
    },
    create: {
      subjectId: knowledgeSubject.id,
      name: "软件设计师 2018 审定版大纲：基础知识",
      version: "mvp"
    }
  });

  const designSyllabus = await prisma.syllabus.upsert({
    where: { subjectId_version: { subjectId: designSubject.id, version: "mvp" } },
    update: {
      name: "软件设计师 2018 审定版大纲：应用技术"
    },
    create: {
      subjectId: designSubject.id,
      name: "软件设计师 2018 审定版大纲：应用技术",
      version: "mvp"
    }
  });

  await seedKnowledgeTree(knowledgeSyllabus.id, knowledgeSubjectNodes);
  await seedKnowledgeTree(designSyllabus.id, designSubjectNodes);
}

async function seedAiPresets() {
  const preset = await prisma.aiProviderPreset.upsert({
    where: {
      provider_model: {
        provider: AiProvider.openai,
        model: "gpt-5.5"
      }
    },
    update: {
      label: "OpenAI GPT-5.5",
      capabilities: ["text", "json", "vision", "document"],
      maxTokens: 8192,
      enabled: true
    },
    create: {
      provider: AiProvider.openai,
      model: "gpt-5.5",
      label: "OpenAI GPT-5.5",
      capabilities: ["text", "json", "vision", "document"],
      maxTokens: 8192,
      enabled: true
    }
  });

  const defaultTasks = Object.values(AiTaskType).filter((taskType) => taskType !== AiTaskType.generate_image);

  for (const taskType of defaultTasks) {
    await prisma.aiProviderPresetTask.upsert({
      where: { taskType },
      update: {},
      create: {
        presetId: preset.id,
        taskType
      }
    });
  }
}

async function seedKnowledgeTree(syllabusId: string, nodes: KnowledgeNodeSeed[]) {
  const targetCodes = new Set<string>();

  async function visit(node: KnowledgeNodeSeed, parentId: string | null) {
    targetCodes.add(node.code);

    const saved = await upsertKnowledgeNode({
      ...node,
      parentId,
      syllabusId
    });

    for (const child of node.children ?? []) {
      await visit(child, saved.id);
    }
  }

  for (const node of nodes) {
    await visit(node, null);
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await prisma.knowledgeNode.deleteMany({
      where: {
        syllabusId,
        code: {
          notIn: [...targetCodes]
        },
        children: {
          none: {}
        },
        questionBindings: {
          none: {}
        },
        userNotes: {
          none: {}
        }
      }
    });
  }
}

async function upsertKnowledgeNode(input: KnowledgeNodeSeed & { parentId: string | null; syllabusId: string }) {
  const existing = await prisma.knowledgeNode.findFirst({
    where: { syllabusId: input.syllabusId, code: input.code }
  });
  const data = {
    parentId: input.parentId,
    title: input.title,
    description: input.description,
    examExpectation: input.examExpectation
  };

  if (existing) {
    return prisma.knowledgeNode.update({
      where: { id: existing.id },
      data
    });
  }

  return prisma.knowledgeNode.create({
    data: {
      syllabusId: input.syllabusId,
      code: input.code,
      ...data
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
