# Plano de Implementacao

## Fase 1

- Subir API com rota de saude.
- Subir web com landing page e navegacao inicial.
- Conectar web com API por `VITE_API_URL`.
- Criar schema Prisma inicial.
- Implementar autenticacao e perfis.

## Fase 2

- CRUD de usuarios.
- CRUD de treinos.
- Matriculas e planos.
- Pagamentos com Asaas em sandbox.
- Frequencia automatica por acesso diario.

## Fase 3

- Avaliacoes fisicas.
- Eventos.
- Atendimento.
- App mobile.
- Agente de Treino IA.

## Fase 4 
- Crie o RBAC significa prioritariamente Controle de Acesso Baseado em Função (Role-Based Access Control)
    Funções: Administrador do sistema
             Aluno

- Login e autenticação com google
    Entrar com Google, Email ou com Telefone

     Entrar com
        E-mail:
        placeholder="Insira seu e-mail"
        Senha:
        Insira sua senha
        placeholder="Campo obrigatório"

        Manter conectado
        OU
        Ao prosseguir você estará de acordo com nossos termos de uso.

        Esqueci minha senha

## Fase 5

    FLUXO:

    LOGIN -> Dentro do sistema, BOTÃO Comece a treinar -> SESSÃO DE PAGAMENTO POR ASSINATURA -> TELA DE CHECKOUT -> PÁGINA DE OBRIGADO -> ACESSO DAS FUNCIONALIDADES LIBERADO

    CLIENTE CONTRATO O FLUXO INDO E VOLTADO COM INFORMAÇÕES JÁ PREENCHIDAS
        Login -> Assinatura -> Checkout -> Obrigado -> Acesso liberado
        Adicione botões para o cliente poder retornar no fluxo de pagamento estando logado.
        O fluxo some após a confirmação do pagamento.


    Mostrar conteúdos abaixo bloqueado com cadeado entanto o aluno segue o fluxo.

## Fase 6

Plano de Implementação: Atualização CMS Fitness B2CEste documento estabelece o passo a passo técnico, sequencial e incremental para integrar a arquitetura de CMS Atômico e o Player de Treino ao MVP funcional existente, garantindo a integridade dos dados atuais.Fase 1: Atualização da Camada de Dados e Seed1.1 Atualização do Schema PrismaModifique o arquivo prisma/schema.prisma existente. Adicione os enums e os modelos relacionais sem remover a tabela User atual. Mantenha os campos originais de autenticação e adicione o campo enrollmentStatus.prismaenum Role {
  ADMIN
  USER
}

enum EnrollmentStatus {
  PENDING
  ACTIVE
  CANCELED
}

enum StructureType {
  NORMAL
  BI_SET
  DROP_SET
  REST_PAUSE
}

// ATENÇÃO: Preserve seus campos originais de Id, Email, Phone, etc.
model User {
  id               String           @id @default(uuid())
  email            String           @unique
  phone            String?
  role             Role             @default(USER)
  enrollmentStatus EnrollmentStatus @default(PENDING)
  createdAt        DateTime         @default(now())
  
  userProgress     UserProgress[]
  enrollments      Enrollment[]
}

model Enrollment {
  id        String           @id @default(uuid())
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  status    EnrollmentStatus @default(PENDING)
  planType  String           
  asaasId   String?          @unique 
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
}

model Exercise {
  id                 String               @id @default(uuid())
  title              String
  videoUrl           String               
  audioUrl           String?
  targetMuscles      String[]             
  equipmentTags      String[]             
  createdAt          DateTime             @default(now())
  
  alternatives       Exercise[]           @relation("ExerciseAlternatives")
  alternativeTo      Exercise[]           @relation("ExerciseAlternatives")
  
  workoutExercises   WorkoutBlockExercise[]
  userProgress       UserProgress[]
}

model WorkoutBlock {
  id            String                 @id @default(uuid())
  title         String                 
  structureType StructureType          @default(NORMAL)
  restTime      Int                    
  createdAt     DateTime               @default(now())
  
  exercises     WorkoutBlockExercise[]
  programDays   ProgramDayWorkout[]
}

model WorkoutBlockExercise {
  id             String       @id @default(uuid())
  workoutBlockId String
  exerciseId     String
  workoutBlock   WorkoutBlock @relation(fields: [workoutBlockId], references: [id], onDelete: Cascade)
  exercise       Exercise     @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  
  sets           Int          
  repsRange      String       
  order          Int          
}

model Program {
  id          String               @id @default(uuid())
  title       String               
  description String
  isActive    Boolean              @default(true)
  createdAt   DateTime             @default(now())
  
  days        ProgramDayWorkout[]
}

model ProgramDayWorkout {
  id             String       @id @default(uuid())
  programId      String
  workoutBlockId String
  program        Program      @relation(fields: [programId], references: [id], onDelete: Cascade)
  workoutBlock   WorkoutBlock @relation(fields: [workoutBlockId], references: [id], onDelete: Cascade)
  
  dayNumber      Int          
  order          Int          
}

model UserProgress {
  id               String   @id @default(uuid())
  userId           String
  exerciseId       String
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  exercise         Exercise @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  
  weightUsed       Float    
  repsCompleted    Int      
  seriesIndex      Int      
  completedAt      DateTime @default(now())
}
Use o código com cuidado.1.2 Execução da MigraçãoExecute o comando no terminal para aplicar as alterações ao banco PostgreSQL local:bashnpx prisma migrate dev --name add_cms_atomic_structure
Use o código com cuidado.1.3 Script de Seed (prisma/seed.ts)Crie ou atualize o script de seed para estruturar dados de teste essenciais para o Player de Treino:typescriptimport { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Criar Exercícios Base e Alternativas
  const exSupino = await prisma.exercise.create({
    data: {
      title: 'Supino Reto com Barra',
      videoUrl: 'https://xn--dck1b3auz8b.com',
      targetMuscles: ['Peito', 'Tríceps', 'Ombro'],
      equipmentTags: ['Barra', 'Banco Reto'],
    },
  });

  const exFlexao = await prisma.exercise.create({
    data: {
      title: 'Flexão de Braço no Solo',
      videoUrl: 'https://xn--dck1b3auz8b.com',
      targetMuscles: ['Peito', 'Tríceps', 'Ombro'],
      equipmentTags: ['Peso Corporal'],
      alternativeTo: { connect: { id: exSupino.id } },
    },
  });

  // 2. Criar Bloco de Treino
  const blocoA = await prisma.workoutBlock.create({
    data: {
      title: 'Bloco A - Força Superior',
      structureType: 'NORMAL',
      restTime: 60,
    },
  });

  // 3. Vincular Exercício ao Bloco com Variáveis
  await prisma.workoutBlockExercise.create({
    data: {
      workoutBlockId: blocoA.id,
      exerciseId: exSupino.id,
      sets: 4,
      repsRange: '8-12',
      order: 1,
    },
  });

  // 4. Criar Programa e Cronograma
  const programa = await prisma.program.create({
    data: {
      title: 'Projeto Definição 30 Dias',
      description: 'Treinos intensos focados em queima de gordura e ganho de massa magra.',
    },
  });

  await prisma.programDayWorkout.create({
    data: {
      programId: programa.id,
      workoutBlockId: blocoA.id,
      dayNumber: 1,
      order: 1,
    },
  });

  console.log('Seed do CMS Fitness executado com sucesso!');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
Use o código com cuidado.Rode o comando:bashnpx prisma db seed
Use o código com cuidado.Fase 2: Backend - API, Proteção e Webhook do Asaas2.1 Middleware de Bloqueio (Gating)Implemente a verificação de segurança no arquivo de rotas ou middleware central do sistema (ex: src/middleware.ts):typescriptimport { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function verifyEnrollmentGating(status: string, pathname: string) {
  const protectedRoutes = ['/api/student/workout', '/student/dashboard/player'];
  
  const isProtected = protectedRoutes.some(route => pathname.startsWith(route));
  
  if (isProtected && status !== 'ACTIVE') {
    return {
      allowed: false,
      redirectUrl: '/student/dashboard/checkout?status=blocked',
      jsonResponse: { error: 'Acesso bloqueado. Matrícula inativa.', code: 'ENROLLMENT_INACTIVE' }
    };
  }
  
  return { allowed: true };
}
Use o código com cuidado.2.2 Rota da API para o Player do Aluno (/api/student/workout/today)Crie o arquivo para buscar dinamicamente a estrutura atômica baseada no dia atual de progresso do aluno:typescript// Exemplo de payload de resposta esperado pelo Frontend
export async function getTodayWorkout(userId: string, dayNumber: number) {
  // 1. Busca a matrícula do usuário para garantir o status ACTIVE
  // 2. Busca o bloco agendado para o respectivo dayNumber
  // 3. Inclui os exercícios do bloco e suas respectivas alternativas cadastradas
  return {
    programTitle: "Projeto Definição 30 Dias",
    dayNumber: dayNumber,
    block: {
      title: "Bloco A - Força Superior",
      structureType: "NORMAL",
      restTime: 60,
      exercises: [
        {
          id: "ex-id-1",
          title: "Supino Reto com Barra",
          videoUrl: "https://cdn.com",
          sets: 4,
          repsRange: "8-12",
          order: 1,
          alternatives: [
            { id: "ex-id-2", title: "Flexão de Braço no Solo", videoUrl: "https://cdn.com" }
          ]
        }
      ]
    }
  };
}
Use o código com cuidado.2.3 Rota de Substituição Dinâmica (/api/student/workout/substitute)Crie o endpoint que recebe o exerciseId atual e retorna instantaneamente as alternativas associadas por relação direta ou compatibilidade de tags.typescript// Lógica interna da API:
// 1. Busca no Prisma exercises cadastrados como alternativas diretas do ID enviado.
// 2. Se vazio, busca exercises que possuam interseção no array targetMuscles e remove o equipamento atual das tags.
Use o código com cuidado.Fase 3: Frontend - Player Mobile Modo Academia3.1 Componente do Player (components/student/WorkoutPlayer.tsx)Implemente a interface vertical com controle de estado para séries, loops de vídeo nativos e o cronômetro regressivo automático.tsximport React, { useState, useEffect } from 'react';

interface Exercise {
  id: string;
  title: string;
  videoUrl: string;
  sets: number;
  repsRange: string;
}

export function WorkoutPlayer({ exercises, restTimeDefault }: { exercises: Exercise[], restTimeDefault: number }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [timer, setTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);

  const activeExercise = exercises[currentIdx];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResting && timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    } else if (timer === 0 && isResting) {
      setIsResting(false);
    }
    return () => clearInterval(interval);
  }, [isResting, timer]);

  const handleCompleteSet = () => {
    if (currentSet < activeExercise.sets) {
      setCurrentSet(currentSet + 1);
      setTimer(restTimeDefault);
      setIsResting(true);
    } else {
      // Avança para o próximo exercício se houver
      if (currentIdx < exercises.length - 1) {
        setCurrentIdx(currentIdx + 1);
        setCurrentSet(1);
        setTimer(restTimeDefault);
        setIsResting(true);
      } else {
        alert('Treino Concluído com sucesso!');
      }
    }
  };

  if (!activeExercise) return <div>Nenhum exercício carregado.</div>;

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-white justify-between p-4 max-w-md mx-auto">
      {/* Topo: Vídeo Demonstrativo */}
      <div className="w-full aspect-video rounded-xl overflow-hidden bg-slate-900 relative">
        <video 
          src={activeExercise.videoUrl} 
          autoPlay 
          loop 
          muted 
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute top-2 left-2 bg-black/60 px-3 py-1 rounded-full text-xs font-bold">
          Exercício {currentIdx + 1}/{exercises.length}
        </div>
      </div>

      {/* Meio: Informações da Série Vigente e Cronômetro */}
      <div className="flex flex-col items-center my-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight mb-1">{activeExercise.title}</h2>
        <p className="text-emerald-400 text-lg font-medium mb-4">Série {currentSet}/{activeExercise.sets} — {activeExercise.repsRange} Repetições</p>

        {isResting ? (
          <div className="w-36 h-36 rounded-full border-4 border-emerald-500 flex flex-col items-center justify-center bg-emerald-950/30 animate-pulse">
            <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Descanso</span>
            <span className="text-4xl font-black">{timer}s</span>
          </div>
        ) : (
          <div className="w-36 h-36 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-900">
            <span className="text-sm text-slate-400">Em Execução</span>
          </div>
        )}
      </div>

      {/* Rodapé: Ações e Inputs */}
      <div className="flex flex-col gap-3 pb-6">
        <div className="flex gap-2">
          <input 
            type="number" 
            placeholder="Carga (kg)" 
            className="w-1/2 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-center focus:outline-none focus:border-emerald-500 text-white font-bold"
          />
          <button 
            onClick={() => alert('Abrir modal de alternativas')}
            className="w-1/2 bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold py-3 px-4 rounded-xl border border-slate-800 transition"
          >
            Substituir Aparelho
          </button>
        </div>

        <button 
          onClick={handleCompleteSet}
          disabled={isResting}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-extrabold text-lg py-4 px-6 rounded-xl transition shadow-lg shadow-emerald-500/10"
        >
          {isResting ? 'Aguarde o Descanso' : `Concluir Série ${currentSet}`}
        </button>
      </div>
    </div>
  );
}
Use o código com cuidado.3.2 View de Bloqueio por Cadeado (components/student/LockedOverlay.tsx)Substitua o acesso direto do aluno sem assinatura por um componente amigável com gatilho para o checkout do Asaas:Ícone de cadeado centralizado.Mensagem: "Este treino está bloqueado".CTA dinâmico: "Finalizar meu pagamento pendente".Fase 4: Esteira de Testes e Validação LocalPara validar o deploy desta nova estrutura sem afetar a estabilidade atual, execute o fluxo de sanidade local nesta ordem estrita:Checagem de Tipagem Estática:bashnpm run typecheck
Use o código com cuidado.Verificação do Build de Produção:bashnpm run build
Use o código com cuidado.Verificação Sandbox de Matrícula:Execute a chamada na API de teste local da sandbox do Asaas para simular a mudança de status do usuário de PENDING para ACTIVE. Verifique se a barreira do middleware libera o acesso ao componente WorkoutPlayer imediatamente após a confirmação.

## 6.1

Quando o usuário entar no Apptreino ele se deparará com o Treino de Hoje, ele entrará no treino terá uma lista completa demostrando quais serão os treinos, cada treino com um uma imagem, nome do treino e descrição, terá a opção de marcar e desmarcar treino o treino como concluido.

O aluno então 
