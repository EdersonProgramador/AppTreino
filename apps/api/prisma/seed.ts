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
      ,
      status: "PUBLISHED",
      isActive: true,
      publishedAt: new Date()
    },
    update: {
      title: "Projeto Definicao 30 Dias",
      description: "Treinos intensos focados em queima de gordura e ganho de massa magra.",
      status: "PUBLISHED",
      isActive: true,
      publishedAt: new Date()
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

  const musculacao = await prisma.modality.upsert({
    where: { slug: "musculacao" },
    create: {
      id: "seed-modality-musculacao",
      name: "Musculação",
      slug: "musculacao",
      description: "Treinos de academia com ficha estruturada por grupos musculares.",
      icon: "dumbbell",
      imageUrl: "/assets/treino-iniciante-abc-academia.png",
      type: "EXERCISE",
      isActive: true,
      sortOrder: 1
    },
    update: {
      name: "Musculação",
      description: "Treinos de academia com ficha estruturada por grupos musculares.",
      icon: "dumbbell",
      imageUrl: "/assets/treino-iniciante-abc-academia.png",
      type: "EXERCISE",
      isActive: true,
      sortOrder: 1
    }
  });

  const beginnerAbcExercises = [
    {
      id: "seed-abc-ex-puxador-alto",
      title: "Puxador Alto",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Puxador", "Cabo"]
    },
    {
      id: "seed-abc-ex-remada-baixa-barra",
      title: "Remada Baixa Barra",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Remada", "Barra", "Cabo"]
    },
    {
      id: "seed-abc-ex-barra-fixa-graviton",
      title: "Barra fixa ou Graviton",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Peso Corporal", "Graviton"]
    },
    {
      id: "seed-abc-ex-rosca-direta",
      title: "Rosca Direta (cabo/barra/halter)",
      targetMuscles: ["Biceps"],
      equipmentTags: ["Cabo", "Barra", "Halter"]
    },
    {
      id: "seed-abc-ex-panturrilhas",
      title: "Panturrilhas",
      targetMuscles: ["Panturrilhas"],
      equipmentTags: ["Maquina", "Peso Corporal"]
    },
    {
      id: "seed-abc-ex-agachamento",
      title: "Agachamento (variações)",
      targetMuscles: ["Quadriceps", "Gluteos", "Posterior"],
      equipmentTags: ["Barra", "Halter", "Peso Corporal"]
    },
    {
      id: "seed-abc-ex-leg-press",
      title: "Leg Press",
      targetMuscles: ["Quadriceps", "Gluteos", "Posterior"],
      equipmentTags: ["Leg Press"]
    },
    {
      id: "seed-abc-ex-mesa-flexora",
      title: "Mesa Flexora",
      targetMuscles: ["Posterior"],
      equipmentTags: ["Mesa Flexora"]
    },
    {
      id: "seed-abc-ex-cadeira-extensora",
      title: "Cadeira Extensora",
      targetMuscles: ["Quadriceps"],
      equipmentTags: ["Cadeira Extensora"]
    },
    {
      id: "seed-abc-ex-abdominal-roda",
      title: "Abdominal Roda",
      targetMuscles: ["Abdomen"],
      equipmentTags: ["Roda Abdominal"]
    },
    {
      id: "seed-abc-ex-supino-reto",
      title: "Supino Reto",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Barra", "Banco Reto"]
    },
    {
      id: "seed-abc-ex-desenvolvimento-militar",
      title: "Desenvolvimento Militar",
      targetMuscles: ["Ombro", "Triceps"],
      equipmentTags: ["Barra", "Halter"]
    },
    {
      id: "seed-abc-ex-supino-inclinado",
      title: "Supino Inclinado (halt ou barra)",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Halter", "Barra", "Banco Inclinado"]
    },
    {
      id: "seed-abc-ex-elevacao-lateral",
      title: "Elevação Lateral",
      targetMuscles: ["Ombro"],
      equipmentTags: ["Halter", "Cabo"]
    },
    {
      id: "seed-abc-ex-triceps-barra-cabo",
      title: "Triceps Barra cabo",
      targetMuscles: ["Triceps"],
      equipmentTags: ["Cabo", "Barra"]
    }
  ];

  for (const exercise of beginnerAbcExercises) {
    await prisma.exercise.upsert({
      where: { id: exercise.id },
      create: {
        id: exercise.id,
        title: exercise.title,
        name: exercise.title,
        notes: "Treino iniciante ABC: progredir carga ou repetição toda semana dentro da zona alvo. Fazer 20 min de cardio pós treino em qualquer aparelho.",
        targetMuscles: exercise.targetMuscles,
        equipmentTags: exercise.equipmentTags,
        modalityLinks: {
          create: {
            modalityId: musculacao.id,
            principal: true
          }
        }
      },
      update: {
        title: exercise.title,
        name: exercise.title,
        notes: "Treino iniciante ABC: progredir carga ou repetição toda semana dentro da zona alvo. Fazer 20 min de cardio pós treino em qualquer aparelho.",
        targetMuscles: exercise.targetMuscles,
        equipmentTags: exercise.equipmentTags
      }
    });

    await prisma.exerciseModality.upsert({
      where: {
        exerciseId_modalityId: {
          exerciseId: exercise.id,
          modalityId: musculacao.id
        }
      },
      create: {
        exerciseId: exercise.id,
        modalityId: musculacao.id,
        principal: true
      },
      update: {
        principal: true
      }
    });
  }

  const beginnerAbcBlocks = [
    {
      id: "seed-abc-block-a-costas-biceps",
      title: "Treino A - Costas + Bíceps",
      restTime: 120,
      exercises: [
        { exerciseId: "seed-abc-ex-puxador-alto", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-abc-ex-remada-baixa-barra", sets: 3, repsRange: "8-10", order: 2 },
        { exerciseId: "seed-abc-ex-barra-fixa-graviton", sets: 3, repsRange: "Falha", order: 3 },
        { exerciseId: "seed-abc-ex-rosca-direta", sets: 3, repsRange: "12", order: 4 },
        { exerciseId: "seed-abc-ex-panturrilhas", sets: 3, repsRange: "12", order: 5 }
      ]
    },
    {
      id: "seed-abc-block-b-pernas-completo",
      title: "Treino B - Pernas completo",
      restTime: 120,
      exercises: [
        { exerciseId: "seed-abc-ex-agachamento", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-abc-ex-leg-press", sets: 3, repsRange: "8-10", order: 2 },
        { exerciseId: "seed-abc-ex-mesa-flexora", sets: 3, repsRange: "10-12", order: 3 },
        { exerciseId: "seed-abc-ex-cadeira-extensora", sets: 3, repsRange: "10-12", order: 4 },
        { exerciseId: "seed-abc-ex-abdominal-roda", sets: 3, repsRange: "15", order: 5 }
      ]
    },
    {
      id: "seed-abc-block-c-peitoral-ombro-triceps",
      title: "Treino C - Peitoral + ombro e tríceps",
      restTime: 120,
      exercises: [
        { exerciseId: "seed-abc-ex-supino-reto", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-abc-ex-desenvolvimento-militar", sets: 3, repsRange: "10-12", order: 2 },
        { exerciseId: "seed-abc-ex-supino-inclinado", sets: 3, repsRange: "8-10", order: 3 },
        { exerciseId: "seed-abc-ex-elevacao-lateral", sets: 3, repsRange: "12", order: 4 },
        { exerciseId: "seed-abc-ex-triceps-barra-cabo", sets: 3, repsRange: "12", order: 5 }
      ]
    }
  ];

  for (const block of beginnerAbcBlocks) {
    await prisma.workoutBlock.upsert({
      where: { id: block.id },
      create: {
        id: block.id,
        title: block.title,
        structureType: "NORMAL",
        restTime: block.restTime
      },
      update: {
        title: block.title,
        structureType: "NORMAL",
        restTime: block.restTime
      }
    });

    for (const exercise of block.exercises) {
      await prisma.workoutBlockExercise.upsert({
        where: { id: `${block.id}-${exercise.order}` },
        create: {
          id: `${block.id}-${exercise.order}`,
          workoutBlockId: block.id,
          exerciseId: exercise.exerciseId,
          sets: exercise.sets,
          repsRange: exercise.repsRange,
          order: exercise.order
        },
        update: {
          workoutBlockId: block.id,
          exerciseId: exercise.exerciseId,
          sets: exercise.sets,
          repsRange: exercise.repsRange,
          order: exercise.order
        }
      });
    }
  }

  const beginnerAbcProgram = await prisma.program.upsert({
    where: { id: "seed-program-treino-iniciante-abc-academia" },
    create: {
      id: "seed-program-treino-iniciante-abc-academia",
      modalityId: musculacao.id,
      title: "Treino Iniciante ABC - Academia",
      description: JSON.stringify({
        description:
          "Planilha de treino iniciante com divisão ABC em dias alternados. Duração: 6 meses. Progredir carga ou repetição toda semana dentro da zona alvo e fazer 20 min de cardio pós treino em qualquer aparelho.",
        modality: "Musculação"
      }),
      status: "PUBLISHED",
      isActive: true,
      publishedAt: new Date()
    },
    update: {
      modalityId: musculacao.id,
      title: "Treino Iniciante ABC - Academia",
      description: JSON.stringify({
        description:
          "Planilha de treino iniciante com divisão ABC em dias alternados. Duração: 6 meses. Progredir carga ou repetição toda semana dentro da zona alvo e fazer 20 min de cardio pós treino em qualquer aparelho.",
        modality: "Musculação"
      }),
      status: "PUBLISHED",
      isActive: true,
      publishedAt: new Date()
    }
  });

  const beginnerAbcProgramDays = [
    { id: "seed-abc-program-day-1", workoutBlockId: "seed-abc-block-a-costas-biceps", dayNumber: 1 },
    { id: "seed-abc-program-day-2", workoutBlockId: "seed-abc-block-b-pernas-completo", dayNumber: 2 },
    { id: "seed-abc-program-day-3", workoutBlockId: "seed-abc-block-c-peitoral-ombro-triceps", dayNumber: 3 }
  ];

  for (const day of beginnerAbcProgramDays) {
    await prisma.programDayWorkout.upsert({
      where: { id: day.id },
      create: {
        id: day.id,
        programId: beginnerAbcProgram.id,
        workoutBlockId: day.workoutBlockId,
        dayNumber: day.dayNumber,
        order: 1
      },
      update: {
        programId: beginnerAbcProgram.id,
        workoutBlockId: day.workoutBlockId,
        dayNumber: day.dayNumber,
        order: 1
      }
    });
  }

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
