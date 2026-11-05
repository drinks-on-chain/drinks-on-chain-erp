import type { ChainTxRef, WineryChainIdentity } from "@drinks-on-chain/mocks";
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  ChainAddress,
  ExplorerLink,
  KeyValueList,
  TxStatusBadge,
} from "@drinks-on-chain/ui";
import { CHAIN_IDENTITY_STATUS, CHAIN_NETWORK, txKindLabel } from "@/lib/erp/chain";
import { fmtDateTime } from "@/lib/format";

// Identidad de la bodega en la red (contrato de la Ola 3 §3.1 y §3.4): cuenta, contrato de NFT y
// las transacciones que los crearon. Los enlaces al explorador son los `explorerUrl` del backend.

/** Estado de una transacción incrustada, con su enlace al explorador (el que da el backend). */
export function TxBadge({ tx }: { tx: ChainTxRef }) {
  return (
    <TxStatusBadge status={tx.status} explorerUrl={tx.explorerUrl} lastError={tx.lastError} attempts={tx.attempts} />
  );
}

/**
 * Qué decir de la identidad cuando no está lista. Nunca se afirma que la cuenta existe si el
 * backend no la devuelve (contrato de la Ola 3 §3.4).
 */
function IdentityNotice({ identity }: { identity: WineryChainIdentity }) {
  switch (identity.status) {
    case "NOT_PROVISIONED":
      return (
        <Alert tone="neutral" title="Tu bodega aún no tiene cuenta en la red">
          Drinks on Chain la crea cuando activa la bodega. Hasta entonces no hay cuenta ni contrato que mostrar, y no se
          puede emitir ningún NFT. No tienes que hacer nada.
        </Alert>
      );
    case "PROVISIONING":
      return (
        <Alert tone="info" title="Preparando tu cuenta en la red">
          Drinks on Chain está creando la cuenta de la bodega y su contrato de NFT. Suele tardar menos de un minuto;
          esta pantalla se actualiza sola.
        </Alert>
      );
    case "FAILED":
      return (
        <Alert tone="danger" title="No se pudo preparar la cuenta en la red">
          {identity.lastError?.message ?? "La red rechazó la operación."} Drinks on Chain tiene que relanzarla; hasta
          entonces no se puede emitir ningún NFT.
          {identity.lastError?.code && (
            <span className="mt-1 block font-mono text-xs text-fg-muted">{identity.lastError.code}</span>
          )}
        </Alert>
      );
    case "PAUSED":
      return (
        <Alert tone="warning" title="El contrato de la bodega está pausado en la red">
          Drinks on Chain detuvo la emisión y la entrega de NFT de la bodega. Consulta con el equipo de operaciones.
        </Alert>
      );
    default:
      return null;
  }
}

export function IdentityCard({ identity }: { identity: WineryChainIdentity }) {
  const status = CHAIN_IDENTITY_STATUS[identity.status];
  const { account, contract } = identity;
  return (
    <Card
      className="grid grid-cols-1 gap-4"
      role="group"
      aria-label="Identidad en la red"
      data-identity={identity.status}
    >
      <CardHeader
        title="Identidad en la red"
        description={CHAIN_NETWORK[identity.network]}
        action={<Badge tone={status.tone}>{status.label}</Badge>}
      />
      <IdentityNotice identity={identity} />
      {identity.pendingTransactions.length > 0 && (
        <ul aria-label="Operaciones en curso" className="m-0 grid list-none gap-2 p-0">
          {identity.pendingTransactions.map((tx) => (
            <li key={tx.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>{txKindLabel(tx.kind)}</span>
              <TxBadge tx={tx} />
            </li>
          ))}
        </ul>
      )}
      {(account || contract) && (
        <KeyValueList
          layout="stacked"
          items={[
            ...(account
              ? [
                  {
                    term: "Cuenta de la bodega",
                    value: (
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <ChainAddress value={account.address} label="Cuenta de la bodega" />
                        <ExplorerLink href={account.explorerUrl}>Ver la cuenta en el explorador</ExplorerLink>
                      </span>
                    ),
                  },
                  { term: "Creación de la cuenta", value: <TxBadge tx={account.createdTx} /> },
                  ...(account.homeDomain ? [{ term: "Dominio declarado", value: account.homeDomain }] : []),
                ]
              : [{ term: "Cuenta de la bodega", value: <span className="text-fg-muted">Todavía no existe.</span> }]),
            ...(contract
              ? [
                  {
                    term: "Contrato de NFT",
                    value: (
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <ChainAddress value={contract.address} label="Contrato de NFT de la bodega" />
                        <ExplorerLink href={contract.explorerUrl}>Ver el contrato en el explorador</ExplorerLink>
                      </span>
                    ),
                  },
                  {
                    term: "Símbolo y nombre",
                    value: (
                      <span>
                        <span className="font-mono font-medium">{contract.symbol}</span> · {contract.name}
                      </span>
                    ),
                  },
                  {
                    term: "Despliegue del contrato",
                    value: (
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <TxBadge tx={contract.deployedTx} />
                        {contract.deployedAt && (
                          <span className="text-sm text-fg-muted">{fmtDateTime(contract.deployedAt)}</span>
                        )}
                      </span>
                    ),
                  },
                ]
              : [{ term: "Contrato de NFT", value: <span className="text-fg-muted">Todavía no existe.</span> }]),
          ]}
        />
      )}
    </Card>
  );
}

/**
 * El backend todavía no sirve la cuenta de la bodega (aún no desplegó la Ola 3): no hay cuenta que
 * mostrar, y se dice así en lugar de un error con reintento.
 */
export function ChainAccountUnavailable() {
  return (
    <div className="max-w-4xl" data-testid="chain-account-unavailable">
      <Alert tone="neutral" title="Tu bodega todavía no tiene cuenta en la red">
        Drinks on Chain aún no ha activado la cuenta de las bodegas en la red Stellar. Cuando lo haga, aquí verás la
        cuenta de tu bodega, su contrato de NFT y sus transacciones. No tienes que hacer nada.
      </Alert>
    </div>
  );
}
