import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const exSupino = await prisma.exercise.upsert({
    where: { id: "seed-ex-supino-reto" },
    create: {
      id: "seed-ex-supino-reto",
      title: "Supino Reto com Barra",
      videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      targetMuscles: ["Peito", "Triceps", "Ombro"],
      equipmentTags: ["Barra", "Banco Reto"]
    },
    update: {
      title: "Supino Reto com Barra",
      videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      targetMuscles: ["Peito", "Triceps", "Ombro"],
      equipmentTags: ["Barra", "Banco Reto"]
    }
  });

  await prisma.exercise.upsert({
    where: { id: "seed-ex-flexao-solo" },
    create: {
      id: "seed-ex-flexao-solo",
      title: "Flexao de Braco no Solo",
      videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      targetMuscles: ["Peito", "Triceps", "Ombro"],
      equipmentTags: ["Peso Corporal"],
      alternativeTo: {
        connect: { id: exSupino.id }
      }
    },
    update: {
      title: "Flexao de Braco no Solo",
      videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      targetMuscles: ["Peito", "Triceps", "Ombro"],
      equipmentTags: ["Peso Corporal"],
      alternativeTo: {
        connect: { id: exSupino.id }
      }
    }
  });

  const blocoA = await prisma.workoutBlock.upsert({
    where: { id: "seed-block-forca-superior" },
    create: {
      id: "seed-block-forca-superior",
      title: "Bloco A - Forca Superior",
      structureType: "NORMAL",
      restTime: 60
    },
    update: {
      title: "Bloco A - Forca Superior",
      structureType: "NORMAL",
      restTime: 60
    }
  });

  await prisma.workoutBlockExercise.upsert({
    where: { id: "seed-block-ex-supino" },
    create: {
      id: "seed-block-ex-supino",
      workoutBlockId: blocoA.id,
      exerciseId: exSupino.id,
      sets: 4,
      repsRange: "8-12",
      order: 1
    },
    update: {
      workoutBlockId: blocoA.id,
      exerciseId: exSupino.id,
      sets: 4,
      repsRange: "8-12",
      order: 1
    }
  });

  const programa = await prisma.program.upsert({
    where: { id: "seed-program-definicao-30-dias" },
    create: {
      id: "seed-program-definicao-30-dias",
      title: "Projeto Definicao 30 Dias",
      description: "Treinos intensos focados em queima de gordura e ganho de massa magra."
    },
    update: {
      title: "Projeto Definicao 30 Dias",
      description: "Treinos intensos focados em queima de gordura e ganho de massa magra.",
      isActive: true
    }
  });

  await prisma.programDayWorkout.upsert({
    where: { id: "seed-program-day-1-block-a" },
    create: {
      id: "seed-program-day-1-block-a",
      programId: programa.id,
      workoutBlockId: blocoA.id,
      dayNumber: 1,
      order: 1
    },
    update: {
      programId: programa.id,
      workoutBlockId: blocoA.id,
      dayNumber: 1,
      order: 1
    }
  });

  console.log("Seed do CMS Fitness executado com sucesso.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
