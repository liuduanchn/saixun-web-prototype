/**
 * 6 个实例项目的「进展差异化档案」
 * ------------------------------------------------------------------
 * 目的：让每个项目在系统里呈现**不同阶段、不同进展**，而不是同一套形状。
 * 差异点覆盖 6 个可被前端直接看到的维度：
 *   1. 训练任务：看板 5 列的状态分布 + 负责人分配
 *   2. 作品诊断：复核状态混合（已确认 / 已驳回 / 待确认）与比例
 *   3. 作品版本：版本数 2–3 版
 *   4. 模拟答辩：场次 1–2 场，含「进行中」会话
 *   5. 资源知识库：条数 4–6 条
 *   6. 学习记录 / 通知：丰富度分级
 */
import { ResourceType, TaskStatus, DiagnosisStatus } from '../src/common/enums';

export interface ExtraDefenseRound {
  question: string;
  answer: string;
  scores: { logic: number; evidence: number; accuracy: number };
  comment: string;
}

export interface ProfileDefenseSession {
  title: string;
  /** 已完成的问答轮次 */
  rounds: ExtraDefenseRound[];
  /** 有 overall = 已结束；无 overall = 进行中（当前轮次取 rounds.length + 1） */
  overall?: string;
  maxRounds: number;
}

export interface ProjectProfile {
  /** 训练任务状态与负责人覆盖：任务标题 → { status, ownerIdx }（ownerIdx 为该项目 students 数组下标） */
  taskPlan: Record<string, { status: TaskStatus; ownerIdx: number }>;
  /** 每个作品版本的上传人下标（按 version 升序） */
  workUploaders: number[];
  /** 追加的作品版本（上传人统一由 workUploaders 按版本序号决定） */
  extraWorks: Array<{
    version: number;
    fileName: string;
    title: string;
    content: string;
    uploaderIdx?: number;
  }>;
  /** 诊断复核策略 */
  review: {
    /** 高/严重风险项是否已复核确认（false = 尚未复核，保持待确认） */
    confirmHigh: boolean;
    /** 额外置为已确认的评分点名称 */
    confirmedExtra?: string[];
    /** 置为已驳回的评分点名称 */
    rejected?: string[];
  };
  /** 答辩场次（按时间倒序写入，数组第一项为最近一场） */
  defenses: ProfileDefenseSession[];
  /** 追加资源 */
  extraResources: Array<{ type: ResourceType; name: string; description: string }>;
  /** 学习记录 / 通知丰富度：1=基础 2=标准 3=完整 */
  feedLevel: 1 | 2 | 3;
  /** 一句话进展说明（用于通知文案与自检输出） */
  stageNote: string;
}

const T = (status: TaskStatus, ownerIdx: number) => ({ status, ownerIdx });

// ======================= 珍珠智能分拣（赛后复盘 · 最成熟）=======================
const pearlProfile: ProjectProfile = {
  stageNote: '结题收尾：任务基本闭环，存在 1 项高危未改完；已完成两轮完整答辩',
  taskPlan: {
    梳理新苗计划申报要求与评审口径: T('DONE', 0),
    手机RAW采集与自研ISP还原流程开发: T('DONE', 2),
    构建珍珠专属高光谱_RGB配对数据集: T('DONE', 1),
    空谱融合注意力模块实现与消融实验: T('DONE', 1),
    国产摩尔线程GPU训练推理适配: T('NEEDS_FIX', 4),
    珍珠四指标分级网络训练与人工一致性比对: T('IN_REVIEW', 1),
    视觉定位与三轴机械臂联调: T('IN_REVIEW', 3),
    发明专利申请材料撰写与答辩深度追问准备: T('DONE', 0),
  },
  workUploaders: [0, 0, 0],
  extraWorks: [
    {
      version: 3,
      fileName: 'pearl-project-plan-v3.md',
      title: '珍珠智能分拣系统结题报告（结题稿）',
      content: `# 基于深度学习光谱重建的珍珠智能分拣系统｜结题报告 V3

## 一、结题摘要
项目按计划完成四个模块的实现与集成：手机 RAW 无损采集流程、改进 Transformer 光谱重建、多光谱珍珠品质分级、视觉定位与机械臂智能分拣。形成可运行的珍珠智能分拣系统一套、珍珠专属高光谱-RGB 配对数据集一份，并完成两项发明专利的申请材料撰写。

## 二、核心成果
### 1. 手机无损采集
自研 ISP 流程（白平衡校正 → 去马赛克 → 响应值归一化）替代厂商处理链路，输出保留原始响应特征的无损 RGB 图像，并集成到采集软件实现流程自动化。

### 2. 光谱重建
在 Transformer 架构中引入空谱融合模块，将空间注意力与波段光谱注意力结合，提升单幅 RGB 图像的多光谱重建能力。模型训练与推理已适配国产摩尔线程 GPU 平台。

### 3. 珍珠品质分级
基于重建的多光谱图像，在特定波段灰度图上分别训练光洁度与光泽度分类模型，同步完成直径与圆度评估以及视野坐标定位。

### 4. 智能分拣
定位坐标与分级结果实时传输至分拣控制系统，由工控机驱动三轴机械臂完成抓取与分拣，实现检测评级与分拣自动化衔接。

## 三、结题阶段遗留问题
1. 国产 GPU 适配仅完成功能跑通，算子替换清单与精度对齐记录尚未整理成文。
2. 光洁度与光泽度的一致性验证样本量不足，缺少多鉴定人独立评级的完整比对。
3. 分拣节拍未按上料、识别、抓取、放料拆分，瓶颈工位定位未完成。

## 四、后续计划
按上述三项遗留问题拆解为修改任务，在以赛促教环节继续迭代；同时把采集流程与重建模型的参数化配置整理为可复用的赛项模板。`,
    },
  ],
  review: {
    confirmHigh: true,
    confirmedExtra: ['空谱融合注意力模块有效性'],
    rejected: ['分拣效率与一致性提升', '专利与论文产出'],
  },
  defenses: [
    {
      title: '第 2 轮模拟答辩（结题验收 · 已完成）',
      maxRounds: 3,
      rounds: [
        {
          question: '结题口径下，请说明系统的实际落地能力与当前可交付的边界。',
          answer:
            '可交付的是采集流程、重建模型、分级模型与联调过的分拣控制链路，以及配套的数据集和两项专利申请材料。边界也很明确：光洁度与光泽度的客观化还没有走到可替代人工的置信水平，我们只主张在样本分布内的判别一致性和可复现性，不做超出验证范围的承诺。',
          scores: { logic: 88, evidence: 82, accuracy: 86 },
          comment: '交付边界陈述克制、可信，符合结题验收口径。',
        },
        {
          question: '两项发明专利的技术方案与现有同类技术的区别是什么？',
          answer:
            '第一项是单幅图像的珍珠直径估计方法，区别在于用光谱重建后的特定波段信息做异形珠最大直径的定位，而不是靠可见光轮廓拟合。第二项是颜色与颜色纯度估计方法，区别在于把相机响应经重建映射到光谱域后再做纯度判别，绕开了 RGB 三通道在同色异谱样本上的信息瓶颈。',
          scores: { logic: 86, evidence: 78, accuracy: 84 },
          comment: '与同类技术的区别说得清楚，权利要求要点可再补充。',
        },
        {
          question: '遗留的三项问题在下一个周期如何安排？',
          answer:
            '按依赖关系排：先补国产平台的算子替换清单和精度对齐记录，因为这项决定后续能否在国产算力上继续迭代；再组织多鉴定人一致性比对，这项需要前置准备样本与鉴定人协调；最后做节拍拆分与瓶颈定位，因为它依赖前三项的稳定版本。已按这个顺序拆成了修改任务。',
          scores: { logic: 89, evidence: 80, accuracy: 85 },
          comment: '依赖关系与排序逻辑清晰，可执行性强。',
        },
      ],
      overall:
        '整体表现优秀：对可交付边界陈述克制，专利技术方案与同类技术的区别说明到位，遗留问题的处理顺序有明确依赖依据。相对第 1 轮的进步主要在证据意识——回答中已能主动区分「已验证」与「待验证」的范围。后续继续按拆解的任务推进即可。',
    },
  ],
  extraResources: [
    {
      type: 'TEMPLATE',
      name: '结题报告与验收材料清单模板',
      description: '结题报告结构、验收材料清单、遗留问题跟踪表的组合模板。',
    },
    {
      type: 'CASE',
      name: '优秀案例：结题阶段交付边界的表述方式',
      description: '结题验收答辩中如何克制地陈述交付能力边界，避免超出验证范围的承诺。',
    },
  ],
  feedLevel: 3,
};

// ======================= 掌上明猪（作品打磨 · 中期）=======================
const mingzhuProfile: ProjectProfile = {
  stageNote: '打磨中期：2 项高危待整改，已开展第 2 轮答辩且尚在进行中',
  taskPlan: {
    梳理智慧养殖相关政策与技术标准: T('DONE', 0),
    两头乌多视角行为数据集构建: T('DONE', 1),
    YOLO系列模型对比与GPU加速优化: T('DONE', 1),
    时序行为建模与病理性虚弱区分: T('NEEDS_FIX', 1),
    诊断手册向量知识库构建与智能体推理链路: T('IN_REVIEW', 2),
    补齐预警提前期的分布统计与漏报分析: T('IN_PROGRESS', 0),
    离线补传一致性规则与故障演练: T('IN_PROGRESS', 2),
    经济效益测算口径与交付物清单整理: T('IN_PROGRESS', 0),
  },
  workUploaders: [0, 0],
  extraWorks: [],
  review: {
    confirmHigh: true,
    rejected: ['时序行为建模精度'],
  },
  defenses: [
    {
      title: '第 2 轮模拟答辩（打磨复查 · 进行中）',
      maxRounds: 3,
      rounds: [
        {
          question: '上一轮提出的预警提前期统计问题，这一轮补齐到什么程度了？',
          answer:
            '已经把观测口径定下来了：以个体行为基线偏离起始时刻为预警起点，以临床症状确认时刻为终点，两者之差作为提前期。目前完成了两个批次共四个栏舍的连续监测记录整理，但样本量还偏小，均值和分布还在统计。漏报的定义也统一了，指有临床记录但系统未报警的情况。',
          scores: { logic: 84, evidence: 76, accuracy: 82 },
          comment: '口径定义清晰，样本量仍不足，但方向正确。',
        },
        {
          question: '离线补传的冲突处理规则现在是怎么定案的？',
          answer:
            '定的是以边缘侧记录为准，因为边缘侧是一手采集。补传按采集时间戳升序，同时间戳冲突时保留先到的边缘记录，覆盖业务侧的同键记录并在日志里留痕。这条规则已经在两处栏舍做了断网注入验证，能正常补回。剩下的问题是长时间断网后积压数据的补传节流还没定，担心恢复瞬间打满带宽。',
          scores: { logic: 86, evidence: 80, accuracy: 84 },
          comment: '规则定案明确且已有验证，主动指出节流这一遗留点，证据意识好。',
        },
      ],
    },
    {
      title: '第 1 轮模拟答辩（首轮追问 · 已完成）',
      maxRounds: 3,
      rounds: [
        {
          question: '在猪只相互遮挡、光线变化的猪场环境下，如何保证个体识别的稳定性？',
          answer:
            '我们用度量学习提取背部黑斑的局部拓扑特征，把个体间的特征距离拉大，而不是走分类模型的路子。跨摄像头靠特征匹配而非位置推理，所以摄像头切换不会打断 ID。跨生长周期是薄弱环节，幼猪到育肥阶段黑斑形态变化较大，特征更新策略还在验证。',
          scores: { logic: 85, evidence: 73, accuracy: 82 },
          comment: '技术路线选择理由充分，薄弱环节说明坦诚。',
        },
        {
          question: '诊断手册数字化以后，智能体给出的建议如何保证可追溯？',
          answer:
            '建议生成时会带检索到的知识条目来源，包括手册章节号和条目编号，教师或兽医可以顺着编号回到原文核对。另外我们把知识库的来源清单固定为现有诊疗手册与本地兽医的经验记录两类，不做来源之外的推断。',
          scores: { logic: 83, evidence: 79, accuracy: 85 },
          comment: '可追溯设计具体，来源边界约束清晰。',
        },
        {
          question: '如果继续打磨，最想补哪一块？',
          answer:
            '补预警提前期的分布统计。这是产品能不能说服养殖户的关键指标，现在只有观测到的较好表现，缺少分布和漏报率，说服力不够。已经在做数据整理了。',
          scores: { logic: 85, evidence: 78, accuracy: 84 },
          comment: '改进方向与产品价值关联明确。',
        },
      ],
      overall:
        '整体表现良好：技术路线选择理由充分，可追溯设计具体，对薄弱环节能如实说明并已列入改进清单。主要不足仍是核心成效指标的统计支撑——预警提前期、行为识别准确率、经济效益测算都只有结论没有分布与口径。建议优先完成预警提前期的分布统计。',
    },
  ],
  extraResources: [
    {
      type: 'QUESTION_BANK',
      name: '答辩题库：容错与数据一致性方向',
      description: '覆盖心跳机制、离线缓存、补传顺序、冲突裁决与补传节流等追问方向。',
    },
  ],
  feedLevel: 3,
};

// ======================= 易货集（原型开发 · 中期偏早）=======================
const yihuojiProfile: ProjectProfile = {
  stageNote: '原型开发：端到端链路已跑通，跨平台异常降级与订单状态机待补',
  taskPlan: {
    梳理专项赛评审要点与平台能力边界: T('DONE', 0),
    移动端商品发布与检索模块开发: T('DONE', 1),
    JS代码块对接Coze商品识别与智能客服: T('IN_PROGRESS', 1),
    后台端商品审核与用户权限管理开发: T('IN_PROGRESS', 2),
    订单状态机与超时_纠纷规则补全: T('NEEDS_FIX', 0),
    商品审核判定细则与抽查机制设计: T('IN_REVIEW', 2),
    补齐性能改善的对照基准与测量说明: T('IN_PROGRESS', 0),
    试运行数据采集与跨端全链路演示脚本: T('TODO', 2),
  },
  workUploaders: [0, 0],
  extraWorks: [],
  review: {
    confirmHigh: false,
    confirmedExtra: ['订单全生命周期规则'],
    rejected: ['资源循环社会价值'],
  },
  defenses: [
    {
      title: '第 1 轮模拟答辩（平台衔接专项 · 已完成）',
      maxRounds: 3,
      rounds: [
        {
          question: '低代码平台本身提供了大量现成能力，本项目自身的技术工作量体现在哪里？',
          answer:
            '平台给的是通用能力，本项目的工作量在场景化设计和跨平台衔接。具体三块：把智能体平台的商品识别和智能客服通过 JS 代码块接进低代码平台，这条链路平台没有现成组件；校园场景信用体系里双认证加发布前审核的规则由我们定义；订单的线下面对面交割模式在通用交易组件里没有对应实现，需要自定义状态规则。',
          scores: { logic: 85, evidence: 74, accuracy: 83 },
          comment: '边界划分清楚，正面回应了低代码技术含量的质疑。',
        },
        {
          question: '商品审核目前依赖人工，如何保证判定标准一致？',
          answer:
            '现阶段确实靠人工，我们用两个手段压不一致：一是把常见的违规类型写成判定细则条目，审核员按条目勾选，而不是自由填写；二是对通过的商品做抽查复核，抽查结果回写给出该审核员的判定一致性参考。细则条目和抽查比例都还在设计，是任务中心里待审核的那条。',
          scores: { logic: 82, evidence: 70, accuracy: 81 },
          comment: '改进手段具体，但细则尚未落地，功能完整度上会失分。',
        },
        {
          question: '商品识别的准确率你是从哪里得到的？',
          answer:
            '是从智能体平台那边返回的结果，我们自己还没有统计过失败样本的特征。目前只知道大模型分类在这个场景下表现可以接受，但缺少按商品类型拆分的准确率，也没有失败案例的归集。这块我们承认是缺口。',
          scores: { logic: 78, evidence: 62, accuracy: 83 },
          comment: '如实说明数据来源与缺口，态度可取但证据链薄弱。',
        },
      ],
      overall:
        '整体表现良好：对平台能力与本项目工作量的边界划分清楚，跨平台衔接与场景化信用体系两项创新点解释到位。主要不足是异常路径与效果指标——外部智能体接口超时降级、订单状态机与纠纷时限规则都未定稿，商品识别准确率缺少按类型拆分的统计。建议优先补齐降级方案与状态机规则。',
    },
  ],
  extraResources: [
    {
      type: 'TEMPLATE',
      name: '订单状态机与超时规则设计模板',
      description: '含状态清单、流转条件、超时动作与纠纷介入时限的填写式模板。',
    },
  ],
  feedLevel: 2,
};

// ======================= 数智畲韵（原型开发 · 中期偏早）=======================
const sheyunProfile: ProjectProfile = {
  stageNote: '原型开发：知识库与工作流已成形，文化合规规则表待专家复核',
  taskPlan: {
    梳理文化传承类赛道评审要点与方案结构: T('DONE', 0),
    畲族非遗知识库构建与术语映射表: T('DONE', 2),
    双模型路由规则与人设提示词配置: T('IN_PROGRESS', 1),
    图腾纹样库与创意生成工作流搭建: T('IN_REVIEW', 1),
    畲语方言语音库采集与标注校验: T('IN_PROGRESS', 2),
    文化合规校验规则与禁忌词表建设: T('NEEDS_FIX', 2),
    跨模态检索评估与错误传播控制设计: T('IN_PROGRESS', 2),
    补齐创作提效的对照口径与试点合作推进: T('TODO', 0),
  },
  workUploaders: [0, 0],
  extraWorks: [],
  review: {
    confirmHigh: true,
  },
  defenses: [
    {
      title: '第 1 轮模拟答辩（技术实现专项 · 已完成）',
      maxRounds: 3,
      rounds: [
        {
          question: '双模型协同中，如何保证同一次对话里不同模型的输出风格是一致的？',
          answer:
            '靠两层约束。第一层路由按任务类型划分，知识密集型走九天，创作类走 DeepSeek，尽量不在一轮里跨类型切换。第二层人设提示词统一，两边的角色定义、语言风格和禁忌词表是同一套，路由切换时人设不重新生成。混合意图时按创作路由，但知识部分先检索再注入。',
          scores: { logic: 83, evidence: 72, accuracy: 81 },
          comment: '两层约束回答具体，混合意图处理策略清楚，缺实测结果。',
        },
        {
          question: '文化合规校验的规则表是怎么来的，可靠性如何？',
          answer:
            '目前是禁忌词表加纹样组合规则两条线，来源是古籍与地方志的描述性约束，加上我们访谈整理的禁忌清单。可靠性上还没做统计，规则表本身也需要文化专家逐条过一遍，这是接下来要做的。判定结果是可解释的，会指出命中哪一条规则，误判时不静默丢弃而是给替代建议。',
          scores: { logic: 84, evidence: 74, accuracy: 83 },
          comment: '来源与可解释性说明清楚，规则表待专家复核的交代合理。',
        },
        {
          question: '检索增强的三级框架里，如果第一层术语映射没有命中会怎样？',
          answer:
            '会往下走语义检索，术语映射只是加速层不是必经层。目前的设计是逐级回退，三层都没召回时不会让模型自由发挥，而是返回知识库未覆盖并给出可追问的方向。这条回退链路的边界条件我们还没有系统测试，只在几个典型查询上验证过。',
          scores: { logic: 81, evidence: 76, accuracy: 84 },
          comment: '回退策略明确且克制，未做全量测试如实说明。',
        },
      ],
      overall:
        '整体表现良好：技术架构层次清晰，双模型路由、三级检索与合规校验的实现思路具体，对规则表待专家复核、回退链路未全量测试等未闭环之处说明坦诚。主要不足是成效指标——创作提效的对照口径缺失，文化传承的参与度指标未定义，跨模态检索的准确性评估方式未说明。建议先补齐指标口径。',
    },
  ],
  extraResources: [
    {
      type: 'MATERIAL',
      name: '技术参考资料：多级检索回退与失败兜底设计',
      description: '分级检索框架的召回边界定义、逐级回退规则与全空兜底应答的设计要点。',
    },
  ],
  feedLevel: 2,
};

// ======================= 思导谱（方案设计 · 早期）=======================
const sidaopuProfile: ProjectProfile = {
  stageNote: '方案设计早期：评分标准已确认、训练路线刚展开，尚未开展答辩与复核',
  taskPlan: {
    梳理智能体赛道评审要点与方案结构: T('DONE', 0),
    构建Python知识点知识图谱与题库挂载: T('IN_PROGRESS', 1),
    名人导师风格数据抽取与风格约束设计: T('IN_PROGRESS', 1),
    三步引导流程的推进判据设计: T('IN_PROGRESS', 2),
    三模式闭环的掌握验证阈值调优: T('TODO', 2),
    学情可视化指标口径与薄弱点判定规则定义: T('TODO', 0),
    补齐兴趣类学习场景的差异化功能设计: T('TODO', 2),
    演示脚本按学习者完整路径重排: T('TODO', 0),
  },
  workUploaders: [0, 0],
  extraWorks: [],
  review: {
    confirmHigh: false,
  },
  defenses: [
    {
      title: '第 1 轮模拟答辩（方案评审 · 进行中）',
      maxRounds: 3,
      rounds: [
        {
          question: '请说明名人导师风格化答疑在技术上如何保证风格一致，同时不牺牲知识准确性。',
          answer:
            '把名人导师的特征拆成语言表达习惯、思维逻辑与语气语调三类，从经典文本与时代背景中抽取后建成独立知识库，答疑时作为风格约束注入。准确性上设定优先级：知识结论始终以知识图谱为准，名人风格只作用于表述方式。两者冲突时以知识点为准。',
          scores: { logic: 84, evidence: 72, accuracy: 81 },
          comment: '冲突处理的优先级规则说明清楚，风格漂移控制手段还比较抽象。',
        },
      ],
    },
  ],
  extraResources: [],
  feedLevel: 1,
};

// ======================= 智划星（方案设计 · 早期）=======================
const zhihuaxingProfile: ProjectProfile = {
  stageNote: '方案设计早期：笔记解析链路搭建中，规划算法规则尚未落地',
  taskPlan: {
    梳理校园生活赛道评审要点与产品定位: T('DONE', 0),
    多源笔记解析链路搭建_OCR_文档解析: T('IN_PROGRESS', 1),
    知识点关联图谱与智能补全规则设计: T('IN_PROGRESS', 2),
    学情掌握度模型与数据权重定义: T('TODO', 1),
    自适应规划算法决策规则设计: T('TODO', 0),
    错题变式题生成规则与知识点对齐: T('TODO', 2),
    知识卡片选取规则与学习进度关联设计: T('TODO', 2),
    补充数据授权与隐私说明_异常路径演示: T('TODO', 0),
  },
  workUploaders: [0, 0],
  extraWorks: [],
  review: {
    confirmHigh: false,
    rejected: ['个人学情建模'],
  },
  defenses: [
    {
      title: '第 1 轮模拟答辩（方案评审 · 已完成）',
      maxRounds: 3,
      rounds: [
        {
          question: '为什么选择个人笔记而不是成绩数据作为学习计划的主要依据？',
          answer:
            '成绩数据是结果数据，粒度粗、反馈周期长，只能说某个模块没掌握好，说不出具体哪一步断了。笔记是过程数据，学生自己标的疑问号和写残的推导过程直接暴露卡点位置。所以我们把笔记作为主数据源，成绩作为校验信号——笔记显示已掌握但成绩持续偏低，说明是应用能力问题而不是理解问题，两类要给的训练不一样。',
          scores: { logic: 87, evidence: 74, accuracy: 82 },
          comment: '两类数据的分工解释清晰，但对权重设定缺少具体说明。',
        },
        {
          question: '当学生连续多天完不成计划时，系统怎么处理？',
          answer:
            '目前实现的是单次偏差处理：把未完成任务拆成更小的子任务，往后顺延并平滑难度梯度。连续偏差的累积处理还没做完整设计，想法是设一个累积阈值，超过之后触发整体计划重构而不是继续顺延，因为一直顺延会让日期越拖越远，学生会有放弃感。',
          scores: { logic: 82, evidence: 66, accuracy: 81 },
          comment: '对未闭环部分说明坦诚，改进思路合理，缺判定阈值。',
        },
        {
          question: '每日推送的知识卡片如何做到个性化而不是随机？',
          answer:
            '坦诚说目前这一版更接近随机。设计意图是卡片内容要和当前学习进度有关联，比如做导数专项计划时应该推导数的历史背景或相邻知识点。选取规则还没定，需要把学情模型输出的掌握度分布接进来才能做。',
          scores: { logic: 80, evidence: 62, accuracy: 85 },
          comment: '如实承认实现与设计意图的差距，可信度高，但功能完整度会失分。',
        },
      ],
      overall:
        '整体表现良好：以笔记作为主数据源、成绩作为校验信号的产品逻辑讲得清楚，对动态计划调整的价值论证到位，对尚未闭环的部分能如实说明并给出改进思路。主要不足是技术深度——自适应规划算法、学情建模权重、变式题生成规则都停留在意图描述层面，缺少可执行的决策规则。建议补齐算法层面的规则说明。',
    },
  ],
  extraResources: [],
  feedLevel: 1,
};

export const PROJECT_PROFILES: Record<string, ProjectProfile> = {
  pearl: pearlProfile,
  sidaopu: sidaopuProfile,
  mingzhu: mingzhuProfile,
  zhihuaxing: zhihuaxingProfile,
  yihuoji: yihuojiProfile,
  sheyun: sheyunProfile,
};

/** 供脚本自检使用：诊断复核状态判定 */
export function reviewStatusOf(
  profile: ProjectProfile,
  pointName: string,
  severity: string,
): DiagnosisStatus {
  if (profile.review.rejected?.includes(pointName)) return 'REJECTED';
  if (profile.review.confirmedExtra?.includes(pointName)) return 'CONFIRMED';
  if (profile.review.confirmHigh && (severity === 'HIGH' || severity === 'CRITICAL')) return 'CONFIRMED';
  return 'PENDING';
}
