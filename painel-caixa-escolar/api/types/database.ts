/**
 * Database type definitions for the GDP system (Story 7.23)
 * Generated from schema analysis (docs/architecture/SCHEMA.md)
 */

export interface Empresa {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  ie?: string;
  endereco?: Record<string, unknown>;
  config_fiscal?: ConfigFiscal;
  created_at: string;
  updated_at: string;
}

export interface ConfigFiscal {
  ambiente: 'homologacao' | 'producao';
  serie: string;
  proximoNumero: string;
  naturezaOperacao: string;
  cfop: string;
  regime: 'simples' | 'lucro_presumido' | 'lucro_real';
  certificado?: string; // base64 PFX
  senha?: string;
  certificadoValidade?: string;
  observacoes?: string;
}

export interface Cliente {
  id: string;
  empresa_id: string;
  nome: string;
  cnpj?: string;
  ie?: string;
  uf?: string;
  cep?: string;
  sre?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  contratos_vinculados?: string[];
  dados_extras?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Contrato {
  id: string;
  empresa_id: string;
  escola?: string;
  processo?: string;
  edital?: string;
  objeto?: string;
  status: 'ativo' | 'encerrado' | 'suspenso' | 'cancelado';
  fornecedor?: string;
  vigencia?: string;
  observacoes?: string;
  data_apuracao?: string; // DATE after migration 011
  itens?: Record<string, unknown>;
  cliente_snapshot?: Record<string, unknown>;
  dados_extras?: Record<string, unknown>;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Pedido {
  id: string;
  empresa_id: string;
  contrato_id?: string;
  escola?: string;
  data?: string;
  status: 'em_aberto' | 'em_preparo' | 'entregue' | 'cancelado' | 'faturado';
  valor: number;
  obs?: string;
  itens?: PedidoItem[];
  fiscal?: Record<string, unknown>;
  cliente?: Record<string, unknown>;
  pagamento?: Record<string, unknown>;
  marcador?: string;
  audit?: AuditInfo;
  dados_extras?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PedidoItem {
  descricao: string;
  qtd: number;
  precoUnitario: number;
  ncm?: string;
  unidade?: string;
}

export interface NotaFiscal {
  id: string;
  empresa_id: string;
  pedido_id?: string;
  contrato_id?: string;
  numero: string;
  serie: string;
  valor: number;
  status: 'pendente' | 'autorizada' | 'cancelada' | 'rejeitada' | 'denegada' | 'inutilizada';
  tipo_nota: 'nfe_real' | 'simulacao' | 'contingencia' | 'devolucao';
  origem?: string;
  emitida_em?: string;
  vencimento?: string;
  cliente?: Record<string, unknown>;
  itens?: PedidoItem[];
  sefaz?: Record<string, unknown>;
  cobranca?: Record<string, unknown>;
  documentos?: Record<string, unknown>;
  parametros?: Record<string, unknown>;
  integracoes?: Record<string, unknown>;
  xml_autorizado?: string;
  chave_acesso?: string;
  protocolo?: string;
  audit?: AuditInfo;
  created_at: string;
  updated_at: string;
}

export interface ContaReceber {
  id: string;
  empresa_id: string;
  pedido_id?: string;
  origem_id?: string;
  descricao?: string;
  valor: number;
  status: 'pendente' | 'emitida' | 'recebida' | 'atrasada' | 'cancelada';
  forma?: string;
  categoria?: string;
  vencimento?: string;
  cliente?: Record<string, unknown>;
  cobranca?: Record<string, unknown>;
  automacao?: Record<string, unknown>;
  audit?: AuditInfo;
  created_at: string;
  updated_at: string;
}

export interface ContaPagar {
  id: string;
  empresa_id: string;
  descricao?: string;
  valor: number;
  status: 'pendente' | 'paga' | 'atrasada' | 'cancelada' | 'emitida';
  forma?: string;
  categoria?: string;
  vencimento?: string;
  fornecedor?: string;
  audit?: AuditInfo;
  created_at: string;
  updated_at: string;
}

export interface Entrega {
  id: string;
  empresa_id: string;
  pedido_id?: string;
  escola?: string;
  data_entrega?: string;
  status_entrega: 'pendente' | 'entregue' | 'devolvido' | 'parcial';
  recebedor?: string;
  obs?: string;
  foto?: string;
  assinatura?: string;
  created_at: string;
  updated_at: string;
}

export interface NfCounter {
  empresa_id: string;
  counter: number;
  updated_at: string;
}

export interface UserEmpresa {
  user_id: string;
  empresa_id: string;
  role: 'admin' | 'operador';
  created_at: string;
}

export interface AuditInfo {
  updatedAt?: string;
  updatedBy?: string;
  createdAt?: string;
  createdBy?: string;
}

// API Response types
export interface HealthCheckResponse {
  status: 'healthy' | 'warning' | 'degraded' | 'critical';
  timestamp: string;
  checks: {
    sgd: ServiceCheck;
    supabase: ServiceCheck;
    certificate: CertificateCheck;
  };
  uptime: number | null;
}

export interface ServiceCheck {
  status: 'healthy' | 'warning' | 'degraded' | 'critical';
  latency_ms?: number;
  http_status?: number;
  message?: string;
  action?: string;
}

export interface CertificateCheck extends ServiceCheck {
  alerts?: Array<{
    empresa_id: string;
    issue: 'expired' | 'expiring_soon' | 'no_expiry_date';
    days?: number;
    severity: 'critical' | 'warning';
  }>;
  empresas_checked?: number;
}

export interface BackupResult {
  success: boolean;
  timestamp: string;
  tables: Record<string, number>;
  errors: Array<{ stage?: string; table?: string; error: string }>;
  size_bytes?: number;
  size_kb?: number;
  xmls_uploaded?: number;
  xmls_total?: number;
}
