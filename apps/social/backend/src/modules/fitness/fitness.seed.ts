import { prisma } from "../../config";

let seeded = false;

export async function ensureFitnessSeed() {
  if (seeded) return;
  const count = await prisma.trainingProgram.count();
  if (count > 0) {
    seeded = true;
    return;
  }

  const strength = await prisma.trainingProgram.create({
    data: {
      title: "Força Full Body",
      description: "Programa de 4 semanas com foco em força e hipertrofia.",
      modality: "Musculação",
      level: "intermediário",
      weeks: 4,
      sortOrder: 1,
      workouts: {
        create: [
          {
            title: "Treino A · Empurrar",
            dayIndex: 1,
            focus: "Peito, ombro, tríceps",
            durationMin: 50,
            exercises: {
              create: [
                { name: "Supino reto", sets: 4, reps: "8-10", restSec: 90, sortOrder: 1 },
                { name: "Desenvolvimento", sets: 3, reps: "10", restSec: 75, sortOrder: 2 },
                { name: "Tríceps corda", sets: 3, reps: "12", restSec: 60, sortOrder: 3 }
              ]
            }
          },
          {
            title: "Treino B · Puxar",
            dayIndex: 2,
            focus: "Costas e bíceps",
            durationMin: 50,
            exercises: {
              create: [
                { name: "Barra fixa", sets: 4, reps: "6-8", restSec: 90, sortOrder: 1 },
                { name: "Remada curvada", sets: 3, reps: "10", restSec: 75, sortOrder: 2 },
                { name: "Rosca direta", sets: 3, reps: "12", restSec: 60, sortOrder: 3 }
              ]
            }
          },
          {
            title: "Treino C · Pernas",
            dayIndex: 3,
            focus: "Quadríceps, posterior, glúteo",
            durationMin: 55,
            exercises: {
              create: [
                { name: "Agachamento", sets: 4, reps: "8", restSec: 120, sortOrder: 1 },
                { name: "Levantamento terra romeno", sets: 3, reps: "10", restSec: 90, sortOrder: 2 },
                { name: "Panturrilha em pé", sets: 4, reps: "15", restSec: 45, sortOrder: 3 }
              ]
            }
          }
        ]
      }
    }
  });

  await prisma.trainingProgram.create({
    data: {
      title: "Condicionamento Cardio",
      description: "Sessões curtas de corrida e HIIT para stamina.",
      modality: "Cardio",
      level: "iniciante",
      weeks: 3,
      sortOrder: 2,
      workouts: {
        create: [
          {
            title: "Corrida intervalada",
            dayIndex: 1,
            focus: "VO2",
            durationMin: 30,
            exercises: {
              create: [
                { name: "Aquecimento", sets: 1, reps: "5 min", restSec: 0, sortOrder: 1 },
                { name: "Tiros 1 min", sets: 8, reps: "1 min", restSec: 60, sortOrder: 2 },
                { name: "Desaceleração", sets: 1, reps: "5 min", restSec: 0, sortOrder: 3 }
              ]
            }
          }
        ]
      }
    }
  });

  await prisma.clubChallenge.createMany({
    data: [
      {
        slug: "5k-semana",
        title: "5 km na semana",
        description: "Some 5 km de corrida ou caminhada até domingo.",
        sport: "CORRIDA",
        goalMeters: 5000,
        period: "WEEK"
      },
      {
        slug: "ciclo-20k",
        title: "20 km de bike",
        description: "Pedale 20 km no ciclo semanal do Clube.",
        sport: "CICLISMO",
        goalMeters: 20000,
        period: "WEEK"
      }
    ]
  });

  await prisma.shopProduct.createMany({
    data: [
      {
        name: "Garrafa térmica 750 ml",
        description: "Mantém bebida gelada no treino.",
        priceCents: 8990,
        category: "Acessórios",
        stock: 40
      },
      {
        name: "Camiseta dry-fit",
        description: "Tecido leve para treino intenso.",
        priceCents: 12990,
        category: "Vestuário",
        stock: 80
      },
      {
        name: "Whey 900 g",
        description: "Proteína para recuperação.",
        priceCents: 15990,
        category: "Suplementos",
        stock: 25
      }
    ]
  });

  const album = await prisma.musicAlbum.create({
    data: {
      title: "Pump Session",
      artist: "App Treino Mix",
      tracks: {
        create: [
          { title: "Warm-up Beat", duration: 180, sortOrder: 1 },
          { title: "Heavy Sets", duration: 210, sortOrder: 2 },
          { title: "Cool Down", duration: 160, sortOrder: 3 }
        ]
      }
    }
  });
  void album;
  void strength;

  await prisma.gymLocation.createMany({
    data: [
      { name: "Unidade Centro", address: "Rua das Flores, 120", city: "São Paulo", phone: "(11) 3000-0001" },
      { name: "Unidade Norte", address: "Av. Atlântica, 850", city: "São Paulo", phone: "(11) 3000-0002" }
    ]
  });

  const starts = new Date();
  starts.setDate(starts.getDate() + 7);
  await prisma.fitnessEvent.create({
    data: {
      title: "Aula especial HIIT",
      description: "Sessão aberta com coach convidado.",
      startsAt: starts,
      location: "Unidade Centro",
      capacity: 40
    }
  });

  seeded = true;
}
