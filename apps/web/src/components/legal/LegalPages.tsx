import { LegalLayout } from "./LegalLayout";
import { legalMeta } from "../../lib/legal-content";
import { brand } from "../../lib/brand";

export function TermsPage() {
  return (
    <LegalLayout title="Termos de Uso">
      <p>
        Estes Termos regulam o uso do {brand.name}, operado por {legalMeta.companyName} (CNPJ {legalMeta.cnpj}
        ), incluindo treinos, rede social entre atletas, vitrine de produtos e serviços digitais.
      </p>
      <h2 className="text-base font-bold text-sand">1. Cadastro e elegibilidade</h2>
      <p>
        Para criar conta você deve informar dados verdadeiros, ter capacidade civil e aceitar estes Termos e a
        Política de Privacidade. Contas são pessoais e intransferíveis.
      </p>
      <h2 className="text-base font-bold text-sand">2. Assinatura e pagamentos</h2>
      <p>
        Planos de treino são cobrados conforme o ciclo escolhido (mensal ou anual) via parceiro de pagamentos
        (Asaas). O acesso às funcionalidades premium depende de matrícula ativa e pagamento confirmado.
      </p>
      <h2 className="text-base font-bold text-sand">3. Vitrine e entregas</h2>
      <p>
        Compras de produtos físicos ou digitais seguem preço, frete e prazo informados no checkout. Retirada na
        academia pode ser oferecida conforme disponibilidade do produto.
      </p>
      <h2 className="text-base font-bold text-sand">4. Conduta na rede social</h2>
      <p>
        É proibido publicar conteúdo ilegal, ofensivo, discriminatório, que viole direitos de terceiros ou
        incentive práticas perigosas. Reservamo-nos o direito de remover conteúdo e suspender contas em caso de
        abuso, denúncias fundadas ou risco à comunidade.
      </p>
      <h2 className="text-base font-bold text-sand">5. Saúde e responsabilidade</h2>
      <p>
        Treinos e orientações não substituem avaliação médica. Consulte um profissional de saúde antes de iniciar
        ou intensificar atividades físicas. Você assume os riscos inerentes à prática esportiva.
      </p>
      <h2 className="text-base font-bold text-sand">6. Propriedade intelectual</h2>
      <p>
        Marca, layout, vídeos, programas de treino e demais materiais são protegidos. É vedada a reprodução ou
        revenda sem autorização prévia.
      </p>
      <h2 className="text-base font-bold text-sand">7. Cancelamento e reembolso</h2>
      <p>
        As regras de garantia, devolução e reembolso estão descritas na{" "}
        <a className="text-brand-gold underline" href="/politica-reembolso">
          Política de Reembolso
        </a>
        .
      </p>
      <h2 className="text-base font-bold text-sand">8. Alterações</h2>
      <p>
        Podemos atualizar estes Termos. A data da última revisão aparece no topo desta página. O uso contínuo após
        alterações indica ciência das novas condições.
      </p>
      <h2 className="text-base font-bold text-sand">9. Contato</h2>
      <p>
        Dúvidas sobre estes Termos:{" "}
        <a className="text-brand-gold underline" href={`mailto:${legalMeta.contactEmail}`}>
          {legalMeta.contactEmail}
        </a>
        .
      </p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        Esta Política descreve como {legalMeta.companyName} trata dados pessoais no {brand.name}, em conformidade
        com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
      </p>
      <h2 className="text-base font-bold text-sand">1. Dados que coletamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Cadastro: nome, e-mail, telefone, sexo, data de nascimento, objetivo e preferências de treino.</li>
        <li>Uso: treinos concluídos, publicações, interações sociais, atividades outdoor (quando autorizado).</li>
        <li>Compras: endereço de entrega, histórico de pedidos e pagamentos.</li>
        <li>Técnicos: logs, IP, dispositivo e cookies essenciais de sessão.</li>
      </ul>
      <h2 className="text-base font-bold text-sand">2. Finalidades</h2>
      <p>
        Prestamos o serviço contratado, processamos pagamentos, personalizamos treinos, moderamos a comunidade,
        cumprimos obrigações legais e melhoramos a plataforma com base em interesse legítimo.
      </p>
      <h2 className="text-base font-bold text-sand">3. Bases legais</h2>
      <p>
        Execução de contrato, consentimento (quando aplicável), cumprimento de obrigação legal e legítimo interesse
        (segurança, prevenção a fraudes e métricas agregadas).
      </p>
      <h2 className="text-base font-bold text-sand">4. Compartilhamento</h2>
      <p>
        Dados podem ser compartilhados com processadores de pagamento (Asaas), envio de e-mail (Resend), frete
        (Melhor Envio), hospedagem (Vercel, Render, Neon, Cloudflare R2) e autoridades quando exigido por lei.
      </p>
      <h2 className="text-base font-bold text-sand">5. Retenção</h2>
      <p>
        Mantemos dados enquanto a conta estiver ativa e pelo prazo necessário para obrigações fiscais, defesa de
        direitos e auditoria, após o que serão anonimizados ou eliminados.
      </p>
      <h2 className="text-base font-bold text-sand">6. Seus direitos</h2>
      <p>
        Você pode solicitar confirmação de tratamento, acesso, correção, portabilidade, anonimização, revogação de
        consentimento e eliminação, conforme a LGPD, pelo e-mail{" "}
        <a className="text-brand-gold underline" href={`mailto:${legalMeta.dpoEmail}`}>
          {legalMeta.dpoEmail}
        </a>
        .
      </p>
      <h2 className="text-base font-bold text-sand">7. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais como HTTPS, controle de acesso, hash de senhas e backups. Nenhum
        sistema é 100% inviolável; notificaremos incidentes relevantes conforme a lei.
      </p>
      <h2 className="text-base font-bold text-sand">8. Encarregado (DPO)</h2>
      <p>
        Contato do encarregado de dados:{" "}
        <a className="text-brand-gold underline" href={`mailto:${legalMeta.dpoEmail}`}>
          {legalMeta.dpoEmail}
        </a>
        .
      </p>
    </LegalLayout>
  );
}

export function RefundPolicyPage() {
  return (
    <LegalLayout title="Política de Reembolso e Devolução">
      <p>
        Esta política complementa os Termos de Uso e esclarece prazos para assinatura digital e produtos da
        vitrine, alinhada ao Código de Defesa do Consumidor quando aplicável.
      </p>
      <h2 className="text-base font-bold text-sand">Assinatura digital (treinos)</h2>
      <p>
        Oferecemos garantia de 7 (sete) dias após a primeira cobrança confirmada da assinatura. Dentro desse prazo,
        solicite cancelamento e reembolso integral por{" "}
        <a className="text-brand-gold underline" href={`mailto:${legalMeta.contactEmail}`}>
          {legalMeta.contactEmail}
        </a>
        , informando o e-mail da conta. Após o prazo, cancelamentos impedem novas cobranças, mas valores já pagos
        não são reembolsados proporcionalmente, salvo disposição legal em contrário.
      </p>
      <h2 className="text-base font-bold text-sand">Produtos físicos (vitrine)</h2>
      <p>
        Você pode desistir da compra em até 7 dias corridos após o recebimento, desde que o produto esteja lacrado ou
        em condição de revenda. Itens personalizados ou perecíveis podem ter regras específicas informadas na página
        do produto.
      </p>
      <h2 className="text-base font-bold text-sand">Produtos digitais</h2>
      <p>
        Conteúdos digitais entregues imediatamente após confirmação de pagamento seguem o art. 49 do CDC apenas
        quando não houver início de consumo; após download ou liberação de acesso, o reembolso fica sujeito à
        análise administrativa.
      </p>
      <h2 className="text-base font-bold text-sand">Como solicitar</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Envie e-mail para {legalMeta.contactEmail} com número do pedido ou e-mail da conta.</li>
        <li>Aguarde confirmação em até 2 dias úteis.</li>
        <li>Reembolsos aprovados são creditados no mesmo meio de pagamento em até 10 dias úteis.</li>
      </ol>
    </LegalLayout>
  );
}
