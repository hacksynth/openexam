import {
  PrismaClient,
  QuestionKind,
  ReviewStatus,
  SourceType,
  Visibility
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const program = await prisma.examProgram.upsert({
    where: { slug: "ruankao" },
    update: {},
    create: {
      name: "Ruankao",
      slug: "ruankao",
      description: "China Computer Technology and Software Professional Technical Qualification"
    }
  });

  const track = await prisma.examTrack.upsert({
    where: { programId_slug: { programId: program.id, slug: "software-designer" } },
    update: {},
    create: {
      programId: program.id,
      name: "Software Designer",
      slug: "software-designer",
      level: "intermediate"
    }
  });

  const cycle = await prisma.examCycle.upsert({
    where: { trackId_slug: { trackId: track.id, slug: "2026-h1" } },
    update: {},
    create: {
      trackId: track.id,
      name: "2026 H1",
      slug: "2026-h1"
    }
  });

  const subject = await prisma.subject.upsert({
    where: { cycleId_slug: { cycleId: cycle.id, slug: "basic-knowledge" } },
    update: {},
    create: {
      cycleId: cycle.id,
      name: "Basic Knowledge",
      slug: "basic-knowledge"
    }
  });

  const syllabus = await prisma.syllabus.upsert({
    where: { subjectId_version: { subjectId: subject.id, version: "mvp" } },
    update: {},
    create: {
      subjectId: subject.id,
      name: "Software Designer MVP Syllabus",
      version: "mvp"
    }
  });

  const existingKnowledgeNode = await prisma.knowledgeNode.findFirst({
    where: { syllabusId: syllabus.id, code: "DS-ALGO-001" }
  });
  const knowledgeNode =
    existingKnowledgeNode ??
    (await prisma.knowledgeNode.create({
      data: {
        syllabusId: syllabus.id,
        code: "DS-ALGO-001",
        title: "Algorithm Complexity",
        description: "Time and space complexity analysis for common algorithms."
      }
    }));

  const stem = "Which notation describes an algorithm whose running time grows linearly with input size?";
  const existingQuestion = await prisma.question.findFirst({ where: { stem } });
  const question =
    existingQuestion ??
    (await prisma.question.create({
      data: {
        kind: QuestionKind.single_choice,
        stem,
        payload: {
          options: [
            { key: "A", text: "O(1)" },
            { key: "B", text: "O(log n)" },
            { key: "C", text: "O(n)" },
            { key: "D", text: "O(n^2)" }
          ]
        },
        answerKey: { value: "C" },
        explanation: "O(n) grows in direct proportion to the input size.",
        difficulty: 1,
        sourceType: SourceType.original,
        visibility: Visibility.public,
        reviewStatus: ReviewStatus.approved,
        knowledgeBindings: {
          create: {
            knowledgeNodeId: knowledgeNode.id,
            weight: 1,
            isPrimary: true
          }
        },
        versions: {
          create: {
            version: 1,
            stem,
            payload: {
              options: [
                { key: "A", text: "O(1)" },
                { key: "B", text: "O(log n)" },
                { key: "C", text: "O(n)" },
                { key: "D", text: "O(n^2)" }
              ]
            },
            answerKey: { value: "C" },
            explanation: "O(n) grows in direct proportion to the input size.",
            sourceType: SourceType.original,
            visibility: Visibility.public,
            reviewStatus: ReviewStatus.approved
          }
        }
      }
    }));

  await prisma.paper.upsert({
    where: { slug: "ruankao-software-designer-basic-sample" },
    update: {},
    create: {
      cycleId: cycle.id,
      subjectId: subject.id,
      title: "Ruankao Software Designer Basic Sample",
      slug: "ruankao-software-designer-basic-sample",
      paperType: "sample",
      visibility: Visibility.public,
      questions: {
        create: {
          questionId: question.id,
          order: 1,
          number: "1",
          section: "Basic Knowledge",
          score: 1
        }
      }
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
