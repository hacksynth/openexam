"use client";

import { useState } from "react";
import { SelectField, SubmitButton, TextareaField, TextField } from "@openexam/core/pixel-ui";
import {
  adminQuestionKindOptions,
  questionReviewStatusOptions,
  questionSourceTypeOptions,
  questionVisibilityOptions
} from "@openexam/core/question-admin";

const visibilityLabels: Record<string, string> = {
  private: "私有",
  unlisted: "未列出",
  public: "公开"
};

const sourceTypeLabels: Record<string, string> = {
  original: "原创",
  authorized: "授权",
  public_domain_or_open: "公开开放",
  user_uploaded: "用户上传",
  ai_generated: "AI 生成",
  unknown: "未知来源"
};

const reviewStatusLabels: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  needs_changes: "需修改",
  takedown: "已下架"
};

const questionKindLabels: Record<string, string> = {
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  blank: "填空",
  short_answer: "简答",
  case_analysis: "案例"
};

const choiceAnswerOptions = ["A", "B", "C", "D"] as const;
const multiChoicePlaceholder = "A,B,C,D 逗号分隔";

type QuestionFormProps = {
  action: (formData: FormData) => Promise<void>;
  id?: string;
  question?: {
    kind: string;
    stem: string;
    optionA?: string | null;
    optionB?: string | null;
    optionC?: string | null;
    optionD?: string | null;
    answer?: string | null;
    difficulty?: number | null;
    explanation?: string | null;
    visibility: string;
    sourceType: string;
    reviewStatus: string;
    sourceTitle?: string | null;
    sourceUrl?: string | null;
    sourceLicense?: string | null;
    knowledgeNodeId?: string | null;
    payloadJson?: string | null;
    answerKeyJson?: string | null;
    rubricJson?: string | null;
  };
  knowledgeNodes: { id: string; label: string }[];
  submitLabel: string;
};

export function QuestionForm({
  action,
  id,
  question,
  knowledgeNodes,
  submitLabel
}: QuestionFormProps) {
  const [kind, setKind] = useState(question?.kind ?? "single_choice");
  const needsOptions = kind === "single_choice" || kind === "multiple_choice";
  const isSingleChoice = kind === "single_choice";
  const isMultiChoice = kind === "multiple_choice";
  const isTrueFalse = kind === "true_false";
  const isBlank = kind === "blank";
  const isSubjective = kind === "short_answer" || kind === "case_analysis";
  const isCaseAnalysis = kind === "case_analysis";

  return (
    <form action={action} className="grid gap-4">
      {id ? <input name="id" type="hidden" value={id} /> : null}
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
        <SelectField defaultValue={question?.kind ?? "single_choice"} label="题型" name="kind" onValueChange={setKind} required>
          {adminQuestionKindOptions.map((k) => (
            <option key={k} value={k}>
              {questionKindLabels[k]}
            </option>
          ))}
        </SelectField>
        <TextField label="难度" name="difficulty" defaultValue={question?.difficulty?.toString() ?? ""} placeholder="1-5" />
        <SelectField label="审核状态" name="reviewStatus" defaultValue={question?.reviewStatus ?? "draft"} required>
          {questionReviewStatusOptions.map((status) => (
            <option key={status} value={status}>
              {reviewStatusLabels[status]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextareaField defaultValue={question?.stem ?? ""} label="题干" name="stem" placeholder={isCaseAnalysis ? "输入具体问题" : "输入题干"} required rows={3} />

      {isCaseAnalysis ? (
        <TextareaField
          defaultValue={question?.payloadJson ? parseCaseMaterial(question.payloadJson) : ""}
          label="案例材料"
          name="caseMaterial"
          placeholder="输入案例背景、场景描述或资料"
          required
          rows={5}
        />
      ) : null}

      {needsOptions ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <TextField label="选项 A" name="optionA" defaultValue={question?.optionA ?? ""} />
          <TextField label="选项 B" name="optionB" defaultValue={question?.optionB ?? ""} />
          <TextField label="选项 C" name="optionC" defaultValue={question?.optionC ?? ""} />
          <TextField label="选项 D" name="optionD" defaultValue={question?.optionD ?? ""} />
        </div>
      ) : null}

      {isTrueFalse ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="border-3 border-black bg-gray-100 px-3 py-2 text-sm font-bold">正确</div>
          <div className="border-3 border-black bg-gray-100 px-3 py-2 text-sm font-bold">错误</div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_1fr_1fr]">
        {isSingleChoice ? (
          <SelectField label="答案" name="answer" defaultValue={question?.answer ?? "A"} required>
            {choiceAnswerOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectField>
        ) : isMultiChoice ? (
          <TextField label="答案（多选）" name="answer" defaultValue={question?.answer ?? ""} placeholder={multiChoicePlaceholder} />
        ) : isTrueFalse ? (
          <SelectField label="答案" name="answer" defaultValue={question?.answer === "false" ? "false" : "true"} required>
            <option value="true">正确</option>
            <option value="false">错误</option>
          </SelectField>
        ) : (
          <TextField
            label={isBlank ? "填空答案" : "参考答案"}
            name="answer"
            defaultValue={question?.answer ?? ""}
            placeholder={isBlank ? "填空标准答案" : "主观题参考答案"}
          />
        )}

        <SelectField label="可见性" name="visibility" defaultValue={question?.visibility ?? "private"} required>
          {questionVisibilityOptions.map((visibility) => (
            <option key={visibility} value={visibility}>
              {visibilityLabels[visibility]}
            </option>
          ))}
        </SelectField>
        <SelectField label="来源类型" name="sourceType" defaultValue={question?.sourceType ?? "original"} required>
          {questionSourceTypeOptions.map((sourceType) => (
            <option key={sourceType} value={sourceType}>
              {sourceTypeLabels[sourceType]}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <SelectField label="主知识点" name="knowledgeNodeId" defaultValue={question?.knowledgeNodeId ?? ""} required>
          <option value="">选择知识点</option>
          {knowledgeNodes.map((node) => (
            <option key={node.id} value={node.id}>
              {node.label}
            </option>
          ))}
        </SelectField>
        <TextField label="answerKey JSON（可选）" name="answerKeyJson" defaultValue={question?.answerKeyJson ?? ""} placeholder='{"value":"A"}' />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <TextField label="来源标题" name="sourceTitle" defaultValue={question?.sourceTitle ?? ""} placeholder="教材 / 真题 / 用户资料标题" />
        <TextField label="来源 URL" name="sourceUrl" defaultValue={question?.sourceUrl ?? ""} placeholder="https://..." />
        <TextField label="来源许可" name="sourceLicense" defaultValue={question?.sourceLicense ?? ""} placeholder="原创 / 授权 / CC BY" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TextareaField
          defaultValue={question?.payloadJson ?? ""}
          label={`payload JSON（${isChoiceType(kind) ? "选择题" : isTrueFalse ? "判断题" : isBlank ? "填空题" : "主观题"}可选）`}
          name="payloadJson"
          placeholder="{}"
          rows={3}
          textareaClassName="font-mono"
        />
        <TextareaField
          defaultValue={question?.rubricJson ?? ""}
          label={`rubric JSON（${isSubjective ? "主观题评分标准" : "可选"}）`}
          name="rubricJson"
          placeholder={isSubjective ? '{"referenceAnswer":"...","points":["要点1","要点2"]}' : "{}"}
          rows={3}
          textareaClassName="font-mono"
        />
      </div>

      <TextareaField defaultValue={question?.explanation ?? ""} label="解析" name="explanation" placeholder="解释正确答案和关键知识点" rows={3} />

      <SubmitButton className="w-fit px-4 py-2" label={submitLabel} />
    </form>
  );
}

function isChoiceType(kind: string) {
  return kind === "single_choice" || kind === "multiple_choice";
}

function parseCaseMaterial(payloadJson: string) {
  try {
    const parsed = JSON.parse(payloadJson) as { caseMaterial?: unknown };
    return typeof parsed.caseMaterial === "string" ? parsed.caseMaterial : "";
  } catch {
    return "";
  }
}
