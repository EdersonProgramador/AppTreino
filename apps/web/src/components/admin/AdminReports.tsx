import {
  Loader2,
  RefreshCw,
  Star,
  Wallet
} from "lucide-react";
import { useMemo } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import {
  dataRowClass,
  panelTitleClass
} from "../../lib/admin-cms-classes";
import type { AdminUser, PaymentRow, PhysicalAssessmentRow, RatingRow } from "../../types";

﻿export function AdminReports({
  users,
  payments,
  assessments,
  ratings,
  lastUpdatedAt,
  loading,
  onRefresh
}: {
  users: AdminUser[];
  payments: PaymentRow[];
  assessments: PhysicalAssessmentRow[];
  ratings: RatingRow[];
  lastUpdatedAt: Date | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const now = useMemo(() => new Date(), [lastUpdatedAt]);

  const monthBuckets = useMemo(() => {
    const buckets: Array<{ key: string; label: string; students: number; assessments: number }> = [];

    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString("pt-BR", { month: "short" }),
        students: 0,
        assessments: 0
      });
    }

    for (const user of users) {
      if (user.role !== "USER" || !user.createdAt) continue;
      const date = new Date(user.createdAt);
      const bucket = buckets.find((item) => item.key === `${date.getFullYear()}-${date.getMonth()}`);
      if (bucket) bucket.students += 1;
    }

    for (const assessment of assessments) {
      const date = new Date(assessment.assessedAt);
      const bucket = buckets.find((item) => item.key === `${date.getFullYear()}-${date.getMonth()}`);
      if (bucket) bucket.assessments += 1;
    }

    return buckets;
  }, [assessments, now, users]);

  const maxStudents = useMemo(() => Math.max(1, ...monthBuckets.map((bucket) => bucket.students)), [monthBuckets]);
  const maxAssessments = useMemo(() => Math.max(1, ...monthBuckets.map((bucket) => bucket.assessments)), [monthBuckets]);

  const revenueByPlan = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      if (payment.status !== "CONFIRMED") continue;
      const planName = payment.membership?.plan?.name ?? "Sem plano";
      map.set(planName, (map.get(planName) ?? 0) + payment.amountInCents);
    }
    return [...map.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((first, second) => second.total - first.total)
      .slice(0, 6);
  }, [payments]);
  const maxPlanRevenue = useMemo(() => Math.max(1, ...revenueByPlan.map((item) => item.total)), [revenueByPlan]);

  const ratingSummary = useMemo(() => {
    if (ratings.length === 0) {
      return {
        average: null as number | null,
        count: 0,
        distribution: [5, 4, 3, 2, 1].map((score) => ({ score, count: 0 })),
        workoutCount: 0,
        productCount: 0
      };
    }
    return {
      average: Math.round((ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length) * 10) / 10,
      count: ratings.length,
      distribution: [5, 4, 3, 2, 1].map((score) => ({ score, count: ratings.filter((rating) => rating.score === score).length })),
      workoutCount: ratings.filter((rating) => rating.targetType === "WORKOUT").length,
      productCount: ratings.filter((rating) => rating.targetType === "PRODUCT").length
    };
  }, [ratings]);
  const maxRatingCount = useMemo(() => Math.max(1, ...ratingSummary.distribution.map((item) => item.count)), [ratingSummary]);

  const formatUpdatedAt = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <section className="admin-reports" id="admin-reports">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Análise e desempenho</span>
          <h1>Relatórios</h1>
        </div>
        <div className="dashboard-actions">
          <button className="outline-button compact-button" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            Atualizar
          </button>
        </div>
      </div>
      <p className="admin-sync-label">
        {loading ? "Sincronizando dados..." : `Atualizado às ${formatUpdatedAt} · sincronização automática a cada 1 minuto`}
      </p>

      <section className="admin-dashboard-grid">
        <article className="table-panel dash-panel dash-panel-wide">
          <div className={panelTitleClass}>
            <div>
              <h2>Receita confirmada por plano</h2>
              <p>Valor dos pagamentos confirmados de cada plano contratado.</p>
            </div>
            <span>{revenueByPlan.length} plano(s)</span>
          </div>
          {revenueByPlan.length > 0 ? (
            <div className="dash-bar-chart">
              {revenueByPlan.map((item) => (
                <div className="dash-bar-column" key={item.name}>
                  <div className="dash-bar-track">
                    <div className="dash-bar-fill" style={{ height: `${Math.round((item.total / maxPlanRevenue) * 100)}%` }} />
                  </div>
                  <span>{item.name}</span>
                  <strong>{formatPriceInBRL(item.total)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-empty">
              <Wallet size={18} />
              Nenhum pagamento confirmado ainda.
            </div>
          )}
        </article>

        <article className="table-panel dash-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Novos alunos</h2>
              <p>Cadastros de alunos nos últimos 6 meses.</p>
            </div>
            <span>{users.filter((item) => item.role === "USER").length}</span>
          </div>
          <div className="dash-bar-chart">
            {monthBuckets.map((bucket) => (
              <div className="dash-bar-column" key={bucket.key}>
                <div className="dash-bar-track">
                  <div className="dash-bar-fill" style={{ height: `${Math.round((bucket.students / maxStudents) * 100)}%` }} />
                </div>
                <span>{bucket.label}</span>
                <strong>{bucket.students}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="table-panel dash-panel">
          <div className={panelTitleClass}>
            <div>
              <h2>Avaliações físicas</h2>
              <p>Registros de avaliação realizados por mês.</p>
            </div>
            <span>{assessments.length}</span>
          </div>
          <div className="dash-bar-chart">
            {monthBuckets.map((bucket) => (
              <div className="dash-bar-column" key={bucket.key}>
                <div className="dash-bar-track">
                  <div className="dash-bar-fill" style={{ height: `${Math.round((bucket.assessments / maxAssessments) * 100)}%` }} />
                </div>
                <span>{bucket.label}</span>
                <strong>{bucket.assessments}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-dashboard-grid">
        <article className="table-panel dash-panel dash-panel-wide">
          <div className={panelTitleClass}>
            <div>
              <h2>Avaliações de alunos</h2>
              <p>
                {ratingSummary.count} avaliação(ões) · {ratingSummary.workoutCount} treino(s) · {ratingSummary.productCount} produto(s)
              </p>
            </div>
            <span>{ratingSummary.average !== null ? `Média ${String(ratingSummary.average).replace(".", ",")}` : "Sem notas"}</span>
          </div>
          <div className="reports-dist-list">
            {ratingSummary.distribution.map((item) => (
              <div className="reports-dist-row" key={item.score}>
                <span>{item.score} ★</span>
                <div className="reports-dist-track">
                  <div className="reports-dist-fill" style={{ width: `${Math.round((item.count / maxRatingCount) * 100)}%` }} />
                </div>
                <small>{item.count}</small>
              </div>
            ))}
          </div>
          {ratings.length > 0 ? (
            [...ratings]
              .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
              .slice(0, 5)
              .map((rating) => (
                <div className={dataRowClass} key={rating.id}>
                  <span>
                    <strong>{rating.user.name}</strong>
                    {rating.targetType === "WORKOUT" ? "Treino" : rating.product?.name ?? "Produto"}
                  </span>
                  <small>
                    {rating.score} ★ {rating.comment ? ` · ${rating.comment}` : ""}
                  </small>
                </div>
              ))
          ) : (
            <div className="dash-empty">
              <Star size={18} />
              Nenhuma avaliação registrada ainda.
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
