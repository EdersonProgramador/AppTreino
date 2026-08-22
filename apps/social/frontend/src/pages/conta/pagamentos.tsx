import { TreinoPage, Panel } from "@/components/treino/TreinoPage";

export default function PagamentosPage() {
  return (
    <TreinoPage title="Pagamentos" subtitle="Histórico financeiro e cartões (visão App Treino).">
      <Panel>
        <p className="text-sm text-slate-600">
          Nesta unificação, cobranças de matrícula e loja ficam no mesmo app. Pedidos da vitrine já aparecem em{" "}
          <strong>Pedidos</strong>; o gateway completo (Asaas) pode ser ligado em seguida usando a API do App Treino.
        </p>
      </Panel>
      <Panel>
        <strong className="text-ink">Plano Treino Social</strong>
        <p className="text-sm text-slate-500">Status: ativo · renovação automática desligada (sandbox)</p>
      </Panel>
    </TreinoPage>
  );
}
