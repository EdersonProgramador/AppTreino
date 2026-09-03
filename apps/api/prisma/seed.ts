import { DEFAULT_PLATFORM_OWNER_EMAIL } from "@app-treino/shared";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth.js";

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
      description: "Treinos intensos focados em queima de gordura e ganho de massa magra.",
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

  // Vincula seed legado (divisão + programa) à modalidade — sem isso o aluno não vê o treino.
  await prisma.workoutBlock.update({
    where: { id: blocoA.id },
    data: { modalityId: musculacao.id }
  });
  await prisma.program.update({
    where: { id: programa.id },
    data: {
      modalityId: musculacao.id,
      description: JSON.stringify({
        description: "Treinos intensos focados em queima de gordura e ganho de massa magra.",
        modality: "Musculação"
      }),
      targetGender: "ALL",
      audienceMode: "ALL_ACTIVE",
      cycleLengthDays: 1,
      plannedSessions: 12,
      totalWorkouts: 12
    }
  });

  for (const exerciseId of [exSupino.id, "seed-ex-flexao-solo"]) {
    await prisma.exerciseModality.upsert({
      where: {
        exerciseId_modalityId: {
          exerciseId,
          modalityId: musculacao.id
        }
      },
      create: {
        exerciseId,
        modalityId: musculacao.id,
        principal: true
      },
      update: {
        principal: true
      }
    });
  }

  const beginnerAbcExercises = [
    {
      id: "seed-abc-ex-puxador-alto",
      title: "Puxador Alto",
      videoUrl: "/assets/exercises/abc/Puxador_Alto.png",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Puxador", "Cabo"]
    },
    {
      id: "seed-abc-ex-remada-baixa-barra",
      title: "Remada Baixa Barra",
      videoUrl: "/assets/exercises/abc/Remada_Baixa_Barra.png",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Remada", "Barra", "Cabo"]
    },
    {
      id: "seed-abc-ex-barra-fixa-graviton",
      title: "Barra fixa ou Graviton",
      videoUrl: "/assets/exercises/abc/Barra_Fixa_ou_Graviton.png",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Peso Corporal", "Graviton"]
    },
    {
      id: "seed-abc-ex-rosca-direta",
      title: "Rosca Direta (cabo/barra/halter)",
      videoUrl: "/assets/exercises/abc/Rosca_Direta.png",
      targetMuscles: ["Biceps"],
      equipmentTags: ["Cabo", "Barra", "Halter"]
    },
    {
      id: "seed-abc-ex-panturrilhas",
      title: "Panturrilhas",
      videoUrl: "/assets/exercises/abc/Panturrilhas.png",
      targetMuscles: ["Panturrilhas"],
      equipmentTags: ["Maquina", "Peso Corporal"]
    },
    {
      id: "seed-abc-ex-agachamento",
      title: "Agachamento (variações)",
      videoUrl: "/assets/exercises/abc/Agachamento_Variacoes.png",
      targetMuscles: ["Quadriceps", "Gluteos", "Posterior"],
      equipmentTags: ["Barra", "Halter", "Peso Corporal"]
    },
    {
      id: "seed-abc-ex-leg-press",
      title: "Leg Press",
      videoUrl: "/assets/exercises/abc/Leg_Press.png",
      targetMuscles: ["Quadriceps", "Gluteos", "Posterior"],
      equipmentTags: ["Leg Press"]
    },
    {
      id: "seed-abc-ex-mesa-flexora",
      title: "Mesa Flexora",
      videoUrl: "/assets/exercises/abc/Mesa_Flexora.png",
      targetMuscles: ["Posterior"],
      equipmentTags: ["Mesa Flexora"]
    },
    {
      id: "seed-abc-ex-cadeira-extensora",
      title: "Cadeira Extensora",
      videoUrl: "/assets/exercises/abc/Cadeira_Extensora.png",
      targetMuscles: ["Quadriceps"],
      equipmentTags: ["Cadeira Extensora"]
    },
    {
      id: "seed-abc-ex-abdominal-roda",
      title: "Abdominal Roda",
      videoUrl: "/assets/exercises/abc/Abdominal_Roda.png",
      targetMuscles: ["Abdomen"],
      equipmentTags: ["Roda Abdominal"]
    },
    {
      id: "seed-abc-ex-supino-reto",
      title: "Supino Reto",
      videoUrl: "/assets/exercises/abc/Supino_Reto.png",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Barra", "Banco Reto"]
    },
    {
      id: "seed-abc-ex-desenvolvimento-militar",
      title: "Desenvolvimento Militar",
      videoUrl: "/assets/exercises/abc/Desenvolvimento_Militar.png",
      targetMuscles: ["Ombro", "Triceps"],
      equipmentTags: ["Barra", "Halter"]
    },
    {
      id: "seed-abc-ex-supino-inclinado",
      title: "Supino Inclinado (halt ou barra)",
      videoUrl: "/assets/exercises/abc/Supino_Inclinado.png",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Halter", "Barra", "Banco Inclinado"]
    },
    {
      id: "seed-abc-ex-elevacao-lateral",
      title: "Elevação Lateral",
      videoUrl: "/assets/exercises/abc/Elevacao_Lateral.png",
      targetMuscles: ["Ombro"],
      equipmentTags: ["Halter", "Cabo"]
    },
    {
      id: "seed-abc-ex-triceps-barra-cabo",
      title: "Triceps Barra cabo",
      videoUrl: "/assets/exercises/abc/Triceps_Barra_Cabo.png",
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
        videoUrl: exercise.videoUrl,
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
        videoUrl: exercise.videoUrl,
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
        restTime: block.restTime,
        modalityId: musculacao.id
      },
      update: {
        title: block.title,
        structureType: "NORMAL",
        restTime: block.restTime,
        modalityId: musculacao.id
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
      targetGender: "MALE",
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
      targetGender: "MALE",
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

  const annualWomenExerciseNotes =
    "Programa anual feminino: aquecer com series progressivas antes dos exercicios principais, trabalhar com 1-3 repeticoes em reserva e progredir carga apenas quando todas as series atingirem o topo da faixa com tecnica segura.";

  const annualWomenExercises = [
    {
      id: "seed-annual-women-ex-supino-inclinado-barra",
      title: "Supino inclinado com barra",
      materialUrl: "https://www.strengthlog.com/incline-bench-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/Incline-Bench-Press.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Barra", "Banco Inclinado"]
    },
    {
      id: "seed-annual-women-ex-supino-inclinado-halteres",
      title: "Supino inclinado com halteres",
      materialUrl: "https://www.strengthlog.com/dumbbell-incline-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/Dumbbell-Incline-Press.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Halter", "Banco Inclinado"]
    },
    {
      id: "seed-annual-women-ex-supino-reto-barra",
      title: "Supino reto com barra",
      materialUrl: "https://www.strengthlog.com/bench-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2021/09/bench-press.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Barra", "Banco Reto"]
    },
    {
      id: "seed-annual-women-ex-supino-reto-halteres",
      title: "Supino reto com halteres",
      materialUrl: "https://www.strengthlog.com/dumbbell-chest-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/Dumbbell-Chest-Press.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Peitoral", "Ombro", "Triceps"],
      equipmentTags: ["Halter", "Banco Reto"]
    },
    {
      id: "seed-annual-women-ex-mergulho-assistido",
      title: "Mergulho assistido",
      materialUrl: "https://www.strengthlog.com/assisted-dips/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2024/11/assisted.dip_.gif?resize=600%2C589&ssl=1",
      targetMuscles: ["Peitoral", "Triceps"],
      equipmentTags: ["Maquina", "Peso Corporal"]
    },
    {
      id: "seed-annual-women-ex-levantamento-terra",
      title: "Levantamento terra",
      materialUrl: "https://www.strengthlog.com/deadlift/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/11/Deadlift.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Costas", "Gluteos", "Posterior"],
      equipmentTags: ["Barra"]
    },
    {
      id: "seed-annual-women-ex-remada-curvada",
      title: "Remada curvada",
      materialUrl: "https://www.strengthlog.com/barbell-row/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2022/03/Barbell-Row.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Barra"]
    },
    {
      id: "seed-annual-women-ex-remada-unilateral",
      title: "Remada unilateral",
      materialUrl: "https://www.strengthlog.com/dumbbell-row/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/Dumbbell-Row.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Halter", "Banco"]
    },
    {
      id: "seed-annual-women-ex-remada-baixa",
      title: "Remada baixa",
      materialUrl: "https://www.strengthlog.com/cable-close-grip-seated-row/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/cable-row-seated-narrow-grip.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Cabo", "Remada"]
    },
    {
      id: "seed-annual-women-ex-puxada-frente",
      title: "Puxada pela frente",
      materialUrl: "https://www.strengthlog.com/lat-pulldown-with-pronated-grip/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/lat-pulldown-with-pronated-grip.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Puxador", "Cabo"]
    },
    {
      id: "seed-annual-women-ex-barra-fixa-supinada",
      title: "Barra fixa supinada",
      materialUrl: "https://www.strengthlog.com/chin-up/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/chin-up.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Costas", "Biceps"],
      equipmentTags: ["Peso Corporal", "Barra Fixa"]
    },
    {
      id: "seed-annual-women-ex-desenvolvimento-barra",
      title: "Desenvolvimento com barra",
      materialUrl: "https://www.strengthlog.com/overhead-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/12/Overhead-press-exercise.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Ombro", "Triceps"],
      equipmentTags: ["Barra"]
    },
    {
      id: "seed-annual-women-ex-desenvolvimento-halteres",
      title: "Desenvolvimento com halteres",
      materialUrl: "https://www.strengthlog.com/dumbbell-shoulder-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/02/Dumbbell-shoulder-press.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Ombro", "Triceps"],
      equipmentTags: ["Halter"]
    },
    {
      id: "seed-annual-women-ex-desenvolvimento-arnold",
      title: "Desenvolvimento Arnold",
      materialUrl: "https://www.strengthlog.com/arnold-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2024/10/arnold-press.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Ombro", "Triceps"],
      equipmentTags: ["Halter"]
    },
    {
      id: "seed-annual-women-ex-elevacao-lateral",
      title: "Elevacao lateral",
      materialUrl: "https://www.strengthlog.com/dumbbell-lateral-raise/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/12/Dumbbell-Lateral-Raise.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Ombro"],
      equipmentTags: ["Halter"]
    },
    {
      id: "seed-annual-women-ex-face-pull",
      title: "Face pull",
      materialUrl: "https://www.strengthlog.com/face-pull/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/05/face-pull.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Ombro", "Costas"],
      equipmentTags: ["Cabo", "Corda"]
    },
    {
      id: "seed-annual-women-ex-agachamento-livre",
      title: "Agachamento livre",
      materialUrl: "https://www.strengthlog.com/squat/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2021/11/squat.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Quadriceps", "Gluteos", "Posterior"],
      equipmentTags: ["Barra"]
    },
    {
      id: "seed-annual-women-ex-agachamento-frontal",
      title: "Agachamento frontal",
      materialUrl: "https://www.strengthlog.com/front-squat/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2021/09/Front-squat.gif?resize=600%2C595&ssl=1",
      targetMuscles: ["Quadriceps", "Gluteos", "Core"],
      equipmentTags: ["Barra"]
    },
    {
      id: "seed-annual-women-ex-agachamento-hack",
      title: "Agachamento hack",
      materialUrl: "https://www.strengthlog.com/hack-squat-machine/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/04/hack-squat-machine.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Quadriceps", "Gluteos"],
      equipmentTags: ["Maquina Hack"]
    },
    {
      id: "seed-annual-women-ex-leg-press",
      title: "Leg press",
      materialUrl: "https://www.strengthlog.com/leg-press/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/11/leg-press.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Quadriceps", "Gluteos", "Posterior"],
      equipmentTags: ["Leg Press"]
    },
    {
      id: "seed-annual-women-ex-passada",
      title: "Passada",
      materialUrl: "https://www.strengthlog.com/dumbbell-walking-lunge/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/06/walking-dumbbell-lunges.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Quadriceps", "Gluteos"],
      equipmentTags: ["Halter"]
    },
    {
      id: "seed-annual-women-ex-terra-romeno",
      title: "Terra romeno",
      materialUrl: "https://www.strengthlog.com/romanian-deadlift/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2022/01/Romanian-deadlift.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Posterior", "Gluteos", "Costas"],
      equipmentTags: ["Barra", "Halter"]
    },
    {
      id: "seed-annual-women-ex-mesa-flexora",
      title: "Mesa flexora",
      materialUrl: "https://www.strengthlog.com/lying-leg-curl/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2023/09/lying-leg-curl.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Posterior"],
      equipmentTags: ["Mesa Flexora"]
    },
    {
      id: "seed-annual-women-ex-panturrilhas",
      title: "Panturrilhas",
      materialUrl: "https://www.strengthlog.com/standing-calf-raise/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/calf-raise-standing.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Panturrilhas"],
      equipmentTags: ["Maquina", "Peso Corporal"]
    },
    {
      id: "seed-annual-women-ex-elevacao-quadril",
      title: "Elevacao de quadril",
      materialUrl: "https://www.strengthlog.com/hip-thrust/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/02/Hip-thrust.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Gluteos", "Posterior"],
      equipmentTags: ["Barra", "Banco"]
    },
    {
      id: "seed-annual-women-ex-agachamento-bulgaro",
      title: "Agachamento bulgaro",
      materialUrl: "https://www.strengthlog.com/bulgarian-split-squat/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2023/02/Bulgarian-split-squat-barbell.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Quadriceps", "Gluteos"],
      equipmentTags: ["Halter", "Banco"]
    },
    {
      id: "seed-annual-women-ex-ponte-gluteos",
      title: "Ponte de gluteos",
      materialUrl: "https://www.strengthlog.com/glute-bridge/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/09/glutebridge.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Gluteos", "Posterior"],
      equipmentTags: ["Peso Corporal", "Barra"]
    },
    {
      id: "seed-annual-women-ex-coice-cabo",
      title: "Coice no cabo",
      materialUrl: "https://www.strengthlog.com/cable-glute-kickback/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/09/cable-glute-kickback.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Gluteos"],
      equipmentTags: ["Cabo"]
    },
    {
      id: "seed-annual-women-ex-rosca-direta",
      title: "Rosca direta",
      materialUrl: "https://www.strengthlog.com/barbell-curl/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/12/Barbell-biceps-curl.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Biceps"],
      equipmentTags: ["Barra"]
    },
    {
      id: "seed-annual-women-ex-rosca-ez",
      title: "Rosca com barra EZ",
      materialUrl: "https://www.strengthlog.com/ez-curl/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2024/11/EZ-curl.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Biceps"],
      equipmentTags: ["Barra EZ"]
    },
    {
      id: "seed-annual-women-ex-rosca-alternada",
      title: "Rosca alternada",
      materialUrl: "https://www.strengthlog.com/dumbbell-curl/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/02/Hantelcurl.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Biceps"],
      equipmentTags: ["Halter"]
    },
    {
      id: "seed-annual-women-ex-rosca-martelo",
      title: "Rosca martelo",
      materialUrl: "https://www.strengthlog.com/hammer-curl/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/02/Hammer-curl.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Biceps", "Antebraco"],
      equipmentTags: ["Halter"]
    },
    {
      id: "seed-annual-women-ex-extensao-triceps",
      title: "Extensao de triceps",
      materialUrl: "https://www.strengthlog.com/overhead-cable-triceps-extension/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/11/overhead-tricep-extension-lower-position.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Triceps"],
      equipmentTags: ["Cabo", "Corda"]
    },
    {
      id: "seed-annual-women-ex-triceps-testa",
      title: "Triceps testa",
      materialUrl: "https://www.strengthlog.com/lying-triceps-extension-ez-bar/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/10/lying-triceps-extension-with-ez-bar.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Triceps"],
      equipmentTags: ["Barra EZ", "Banco"]
    },
    {
      id: "seed-annual-women-ex-triceps-cabo",
      title: "Triceps no cabo",
      materialUrl: "https://www.strengthlog.com/tricep-pushdown-with-bar/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/triceps-pushdown-with-straight-handle.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Triceps"],
      equipmentTags: ["Cabo", "Barra"]
    },
    {
      id: "seed-annual-women-ex-abdominal-corda",
      title: "Abdominal com corda",
      materialUrl: "https://www.strengthlog.com/cable-crunch/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/cable-crunch.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Abdomen"],
      equipmentTags: ["Cabo", "Corda"]
    },
    {
      id: "seed-annual-women-ex-elevacao-pernas-cadeira",
      title: "Elevacao de pernas em cadeira",
      materialUrl: "https://www.strengthlog.com/captains-chair-leg-raise/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/10/captains-chair-leg-raises.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Abdomen"],
      equipmentTags: ["Cadeira Romana"]
    },
    {
      id: "seed-annual-women-ex-roda-abdominal",
      title: "Roda abdominal",
      materialUrl: "https://www.strengthlog.com/kneeling-ab-wheel-roll-out/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2020/05/kneeling-ab-wheel.gif?resize=600%2C600&ssl=1",
      targetMuscles: ["Abdomen", "Core"],
      equipmentTags: ["Roda Abdominal"]
    },
    {
      id: "seed-annual-women-ex-bicicleta",
      title: "Bicicleta abdominal",
      materialUrl: "https://www.strengthlog.com/bicycle-crunch/",
      videoUrl: "https://i0.wp.com/www.strengthlog.com/wp-content/uploads/2025/06/bicycle.crunch-.gif?resize=700%2C700&ssl=1",
      targetMuscles: ["Abdomen"],
      equipmentTags: ["Peso Corporal"]
    },
    {
      id: "seed-annual-women-ex-prancha-inclinada",
      title: "Prancha inclinada",
      materialUrl: "https://www.strengthlog.com/plank/",
      videoUrl: "https://i2.wp.com/www.strengthlog.com/wp-content/uploads/2020/03/Plank.jpg?fit=1024%2C1024&ssl=1",
      targetMuscles: ["Abdomen", "Core"],
      equipmentTags: ["Peso Corporal", "Banco"]
    }
  ];

  for (const exercise of annualWomenExercises) {
    await prisma.exercise.upsert({
      where: { id: exercise.id },
      create: {
        id: exercise.id,
        title: exercise.title,
        name: exercise.title,
        videoUrl: exercise.videoUrl,
        materialUrl: exercise.materialUrl,
        notes: annualWomenExerciseNotes,
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
        videoUrl: exercise.videoUrl,
        materialUrl: exercise.materialUrl,
        notes: annualWomenExerciseNotes,
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

  const annualWomenBlocks = [
    {
      id: "seed-annual-women-block-1-peito-panturrilhas",
      title: "Anual Feminino D1 - Peito + panturrilhas",
      restTime: 120,
      exercises: [
        { exerciseId: "seed-annual-women-ex-supino-inclinado-barra", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-annual-women-ex-supino-reto-halteres", sets: 3, repsRange: "8-10", order: 2 },
        { exerciseId: "seed-annual-women-ex-mergulho-assistido", sets: 3, repsRange: "8-10", order: 3 },
        { exerciseId: "seed-annual-women-ex-panturrilhas", sets: 3, repsRange: "10-12", order: 4 }
      ]
    },
    {
      id: "seed-annual-women-block-2-costas-gluteos-abdome",
      title: "Anual Feminino D2 - Costas + gluteos e abdome",
      restTime: 120,
      exercises: [
        { exerciseId: "seed-annual-women-ex-levantamento-terra", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-annual-women-ex-remada-unilateral", sets: 3, repsRange: "8-10", order: 2 },
        { exerciseId: "seed-annual-women-ex-puxada-frente", sets: 3, repsRange: "8-10", order: 3 },
        { exerciseId: "seed-annual-women-ex-elevacao-quadril", sets: 3, repsRange: "8-10", order: 4 },
        { exerciseId: "seed-annual-women-ex-abdominal-corda", sets: 3, repsRange: "10-12", order: 5 }
      ]
    },
    {
      id: "seed-annual-women-block-3-ombros-panturrilhas",
      title: "Anual Feminino D3 - Ombros + panturrilhas",
      restTime: 120,
      exercises: [
        { exerciseId: "seed-annual-women-ex-desenvolvimento-halteres", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-annual-women-ex-desenvolvimento-arnold", sets: 3, repsRange: "8-10", order: 2 },
        { exerciseId: "seed-annual-women-ex-elevacao-lateral", sets: 3, repsRange: "10-12", order: 3 },
        { exerciseId: "seed-annual-women-ex-face-pull", sets: 3, repsRange: "10-12", order: 4 },
        { exerciseId: "seed-annual-women-ex-panturrilhas", sets: 3, repsRange: "10-12", order: 5 }
      ]
    },
    {
      id: "seed-annual-women-block-4-bracos-abdome",
      title: "Anual Feminino D4 - Bracos + abdome",
      restTime: 90,
      exercises: [
        { exerciseId: "seed-annual-women-ex-rosca-direta", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-annual-women-ex-rosca-martelo", sets: 3, repsRange: "8-10", order: 2 },
        { exerciseId: "seed-annual-women-ex-extensao-triceps", sets: 3, repsRange: "8-10", order: 3 },
        { exerciseId: "seed-annual-women-ex-triceps-cabo", sets: 3, repsRange: "8-10", order: 4 },
        { exerciseId: "seed-annual-women-ex-roda-abdominal", sets: 3, repsRange: "10-12", order: 5 }
      ]
    },
    {
      id: "seed-annual-women-block-5-pernas-gluteos",
      title: "Anual Feminino D5 - Pernas + gluteos",
      restTime: 120,
      exercises: [
        { exerciseId: "seed-annual-women-ex-agachamento-livre", sets: 3, repsRange: "8-10", order: 1 },
        { exerciseId: "seed-annual-women-ex-leg-press", sets: 3, repsRange: "8-10", order: 2 },
        { exerciseId: "seed-annual-women-ex-terra-romeno", sets: 3, repsRange: "8-10", order: 3 },
        { exerciseId: "seed-annual-women-ex-agachamento-bulgaro", sets: 3, repsRange: "8-10", order: 4 },
        { exerciseId: "seed-annual-women-ex-mesa-flexora", sets: 3, repsRange: "10-12", order: 5 },
        { exerciseId: "seed-annual-women-ex-coice-cabo", sets: 3, repsRange: "10-12", order: 6 }
      ]
    }
  ];

  for (const block of annualWomenBlocks) {
    await prisma.workoutBlock.upsert({
      where: { id: block.id },
      create: {
        id: block.id,
        title: block.title,
        structureType: "NORMAL",
        restTime: block.restTime,
        modalityId: musculacao.id
      },
      update: {
        title: block.title,
        structureType: "NORMAL",
        restTime: block.restTime,
        modalityId: musculacao.id
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

  const annualWomenProgram = await prisma.program.upsert({
    where: { id: "seed-program-anual-musculacao-mulheres" },
    create: {
      id: "seed-program-anual-musculacao-mulheres",
      modalityId: musculacao.id,
      title: "Programa anual de musculação para mulheres",
      description: JSON.stringify({
        description:
          "Ciclo anual de 53 semanas para forca, hipertrofia e melhora sustentavel da composicao corporal. Inclui 6 fases de 8 semanas, semanas de recuperacao entre fases, aquecimento progressivo, controle de esforco com 1-3 repeticoes em reserva e adaptacao para 3, 4 ou 5 dias semanais conforme agenda e recuperacao.",
        modality: "Musculação"
      }),
      targetGender: "FEMALE",
      totalWorkouts: 265,
      sortOrder: 2,
      status: "PUBLISHED",
      isActive: true,
      publishedAt: new Date()
    },
    update: {
      modalityId: musculacao.id,
      title: "Programa anual de musculação para mulheres",
      description: JSON.stringify({
        description:
          "Ciclo anual de 53 semanas para forca, hipertrofia e melhora sustentavel da composicao corporal. Inclui 6 fases de 8 semanas, semanas de recuperacao entre fases, aquecimento progressivo, controle de esforco com 1-3 repeticoes em reserva e adaptacao para 3, 4 ou 5 dias semanais conforme agenda e recuperacao.",
        modality: "Musculação"
      }),
      targetGender: "FEMALE",
      totalWorkouts: 265,
      sortOrder: 2,
      status: "PUBLISHED",
      isActive: true,
      publishedAt: new Date()
    }
  });

  const annualWomenProgramDays = annualWomenBlocks.map((block, index) => ({
    id: `seed-annual-women-program-day-${index + 1}`,
    workoutBlockId: block.id,
    dayNumber: index + 1
  }));

  await prisma.programDayWorkout.deleteMany({
    where: {
      programId: annualWomenProgram.id,
      id: {
        notIn: annualWomenProgramDays.map((day) => day.id)
      }
    }
  });

  for (const day of annualWomenProgramDays) {
    await prisma.programDayWorkout.upsert({
      where: { id: day.id },
      create: {
        id: day.id,
        programId: annualWomenProgram.id,
        workoutBlockId: day.workoutBlockId,
        dayNumber: day.dayNumber,
        order: 1
      },
      update: {
        programId: annualWomenProgram.id,
        workoutBlockId: day.workoutBlockId,
        dayNumber: day.dayNumber,
        order: 1
      }
    });
  }

  const activeStudentsForAnnualWomenProgram = await prisma.user.findMany({
    where: {
      role: "USER",
      status: "ACTIVE",
      profile: {
        gender: "FEMALE"
      },
      OR: [
        {
          enrollmentStatus: "ACTIVE"
        },
        {
          memberships: {
            some: {
              status: "ACTIVE"
            }
          }
        }
      ]
    },
    select: {
      id: true
    }
  });

  for (const student of activeStudentsForAnnualWomenProgram) {
    await prisma.userProgram.upsert({
      where: {
        userId_programId: {
          userId: student.id,
          programId: annualWomenProgram.id
        }
      },
      create: {
        userId: student.id,
        programId: annualWomenProgram.id,
        currentDay: 1,
        totalWorkouts: annualWomenProgram.totalWorkouts,
        completedWorkouts: 0,
        status: "ACTIVE"
      },
      update: {
        currentDay: 1,
        totalWorkouts: annualWomenProgram.totalWorkouts,
        status: "ACTIVE",
        completedAt: null
      }
    });
  }

  const e2ePassword = process.env.E2E_STUDENT_PASSWORD ?? "Teste@123";
  const e2eEmail = (process.env.E2E_STUDENT_EMAIL ?? "teste@gmail.com").trim().toLowerCase();
  const e2ePhone = "11999990000";
  const e2ePasswordHash = await hashPassword(e2ePassword);

  const e2eUser = await prisma.user.upsert({
    where: { email: e2eEmail },
    create: {
      name: "Aluno Teste",
      email: e2eEmail,
      phone: e2ePhone,
      passwordHash: e2ePasswordHash,
      provider: "EMAIL",
      role: "USER",
      status: "ACTIVE",
      enrollmentStatus: "ACTIVE",
      profile: {
        create: {
          phone: e2ePhone,
          gender: "MALE",
          objective: "Hipertrofia",
          level: "Intermediario",
          daysPerWeek: 4,
          equipmentTags: ["Academia"]
        }
      }
    },
    update: {
      name: "Aluno Teste",
      phone: e2ePhone,
      passwordHash: e2ePasswordHash,
      provider: "EMAIL",
      role: "USER",
      status: "ACTIVE",
      enrollmentStatus: "ACTIVE",
      deletedAt: null
    }
  });

  // Acesso liberado como pós-pagamento Asaas / autorização admin: membership ACTIVE.
  const e2ePlan = await prisma.plan.upsert({
    where: { code: "monthly" },
    create: {
      code: "monthly",
      name: "Mensal",
      priceInCents: 9700,
      billingCycle: "MONTHLY"
    },
    update: {
      name: "Mensal",
      priceInCents: 9700,
      billingCycle: "MONTHLY",
      deletedAt: null
    }
  });

  const e2eStartsAt = new Date();
  e2eStartsAt.setUTCHours(0, 0, 0, 0);
  const e2eEndsAt = new Date(e2eStartsAt);
  e2eEndsAt.setUTCMonth(e2eEndsAt.getUTCMonth() + 1);

  const existingActiveMembership = await prisma.membership.findFirst({
    where: {
      userId: e2eUser.id,
      status: "ACTIVE",
      deletedAt: null
    }
  });

  if (existingActiveMembership) {
    await prisma.membership.update({
      where: { id: existingActiveMembership.id },
      data: {
        planId: e2ePlan.id,
        startsAt: e2eStartsAt,
        endsAt: e2eEndsAt,
        deletedAt: null
      }
    });
  } else {
    await prisma.membership.create({
      data: {
        userId: e2eUser.id,
        planId: e2ePlan.id,
        status: "ACTIVE",
        startsAt: e2eStartsAt,
        endsAt: e2eEndsAt
      }
    });
  }

  console.log(`Seed do CMS Fitness executado com sucesso. E2E student: ${e2eEmail} (membership ACTIVE)`);

  const e2eAdminEmail = (process.env.E2E_ADMIN_EMAIL ?? "admin@apptreino.com").trim().toLowerCase();
  const e2eAdminPassword = process.env.E2E_ADMIN_PASSWORD ?? "Admin@123";
  const e2eAdminPhone = "11988880000";
  const e2eAdminPasswordHash = await hashPassword(e2eAdminPassword);

  await prisma.user.upsert({
    where: { email: e2eAdminEmail },
    create: {
      name: "Admin Teste",
      email: e2eAdminEmail,
      phone: e2eAdminPhone,
      passwordHash: e2eAdminPasswordHash,
      provider: "EMAIL",
      role: "ADMIN",
      status: "ACTIVE",
      enrollmentStatus: "ACTIVE"
    },
    update: {
      name: "Admin Teste",
      phone: e2eAdminPhone,
      passwordHash: e2eAdminPasswordHash,
      provider: "EMAIL",
      role: "ADMIN",
      status: "ACTIVE",
      enrollmentStatus: "ACTIVE",
      deletedAt: null
    }
  });

  console.log(`E2E admin: ${e2eAdminEmail}`);

  const platformOwnerEmail = DEFAULT_PLATFORM_OWNER_EMAIL;
  const platformOwner = await prisma.user.findUnique({ where: { email: platformOwnerEmail } });
  if (platformOwner) {
    await prisma.user.update({
      where: { id: platformOwner.id },
      data: { role: "ADMIN", status: "ACTIVE", deletedAt: null }
    });
    await prisma.platformOperator.upsert({
      where: { userId: platformOwner.id },
      create: { userId: platformOwner.id },
      update: {}
    });
    console.log(`Platform operator: ${platformOwnerEmail}`);
  }

  const defaultFeatures = [
    "running_engine",
    "walking_engine",
    "cycling_engine",
    "fixed_training_programs",
    "progress_tracking",
    "activity_history"
  ];
  const plans = await prisma.plan.findMany({ where: { deletedAt: null } });
  for (const plan of plans) {
    for (const featureKey of defaultFeatures) {
      await prisma.planFeature.upsert({
        where: { planId_featureKey: { planId: plan.id, featureKey } },
        create: { planId: plan.id, featureKey },
        update: {}
      });
    }
  }
  console.log("Plan features seeded for individual entitlements.");

  const demoOrg = await prisma.organization.upsert({
    where: { slug: "box-cross" },
    create: {
      id: "seed-org-box-cross",
      name: "Box Cross",
      slug: "box-cross",
      type: "BOX",
      status: "ACTIVE"
    },
    update: {
      name: "Box Cross",
      type: "BOX",
      status: "ACTIVE",
      deletedAt: null
    }
  });

  await prisma.unit.upsert({
    where: { id: "seed-unit-medicilandia" },
    create: {
      id: "seed-unit-medicilandia",
      organizationId: demoOrg.id,
      name: "Medicilândia",
      city: "Medicilândia",
      state: "PA",
      status: "ACTIVE"
    },
    update: {
      organizationId: demoOrg.id,
      name: "Medicilândia",
      city: "Medicilândia",
      state: "PA",
      status: "ACTIVE",
      deletedAt: null
    }
  });
  console.log("Demo organization: Box Cross / Medicilândia-PA");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
