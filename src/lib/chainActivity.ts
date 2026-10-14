import { useEffect, useState } from 'react';
import { createPublicClient, formatUnits, getAddress, http, isAddress, parseAbiItem, type Address } from 'viem';
import { arcChain, arcRpcUrl, NAMES, namesAbi, USDC } from '@/lib/arc';
import { readLedger, type ActivityItem } from '@/lib/ledger';

const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

function client() {
  return createPublicClient({ chain: arcChain(), transport: http(arcRpcUrl()) });
}

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function loadChainActivity(account: string): Promise<ActivityItem[]> {
  if (!isAddress(account)) return [];
  const rpc = client();
  const me = getAddress(account);
  const latest = await rpc.getBlockNumber();
  const span = 9_999n;
  const fromBlock = latest > 80_000n ? latest - 80_000n : 0n;
  const rows: { from: Address; to: Address; value: bigint; hash: string; index: number; block: bigint; direction: 'in' | 'out' }[] = [];

  for (let start = fromBlock; start <= latest; start += span) {
    const end = start + span - 1n > latest ? latest : start + span - 1n;
    const [outgoing, incoming] = await Promise.all([
      rpc.getLogs({ address: USDC, event: transfer, args: { from: me }, fromBlock: start, toBlock: end }),
      rpc.getLogs({ address: USDC, event: transfer, args: { to: me }, fromBlock: start, toBlock: end }),
    ]);
    for (const log of outgoing) {
      if (!log.args.to || log.args.value === undefined || !log.transactionHash || log.blockNumber === null) continue;
      rows.push({ from: me, to: log.args.to, value: log.args.value, hash: log.transactionHash, index: log.logIndex ?? 0, block: log.blockNumber, direction: 'out' });
    }
    for (const log of incoming) {
      if (!log.args.from || getAddress(log.args.from) === me || log.args.value === undefined || !log.transactionHash || log.blockNumber === null) continue;
      rows.push({ from: log.args.from, to: me, value: log.args.value, hash: log.transactionHash, index: log.logIndex ?? 0, block: log.blockNumber, direction: 'in' });
    }
  }

  const blocks = [...new Set(rows.map((row) => row.block))];
  const times = new Map<string, number>();
  await Promise.all(
    blocks.map(async (block) => {
      const found = await rpc.getBlock({ blockNumber: block });
      times.set(block.toString(), Number(found.timestamp) * 1000);
    }),
  );

  const others = [...new Set(rows.map((row) => (row.direction === 'out' ? row.to : row.from)))];
  const names = new Map<string, string>();
  await Promise.all(
    others.map(async (address) => {
      try {
        const name = await rpc.readContract({ address: NAMES, abi: namesAbi, functionName: 'handleOf', args: [address] });
        if (name) names.set(address.toLowerCase(), name);
      } catch {
        names.set(address.toLowerCase(), '');
      }
    }),
  );

  return rows
    .map((row) => {
      const other = row.direction === 'out' ? row.to : row.from;
      const name = names.get(other.toLowerCase()) || '';
      return {
        id: `${row.hash}:${row.index}`,
        kind: 'send' as const,
        title: row.direction === 'out' ? 'Sent' : 'Received',
        amount: Number(formatUnits(row.value, 6)),
        who: name || short(other),
        direction: row.direction,
        status: 'confirmed' as const,
        txHash: row.hash,
        at: times.get(row.block.toString()) ?? Date.now(),
      };
    })
    .sort((a, b) => b.at - a.at);
}

export function pendingPayments(): ActivityItem[] {
  return readLedger().activity.filter((row) => row.status === 'pending' && (row.kind === 'send' || row.kind === 'tip'));
}

export function mergeActivity(chain: ActivityItem[]) {
  const seen = new Set(chain.map((row) => row.txHash).filter(Boolean));
  const waiting = pendingPayments().filter((row) => !row.txHash || !seen.has(row.txHash));
  return [...waiting, ...chain];
}

export function useChainActivity(account: string) {
  const [rows, setRows] = useState<ActivityItem[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!account || !isAddress(account)) {
      setRows(mergeActivity([]));
      return;
    }
    let gone = false;
    const run = () => {
      loadChainActivity(account)
        .then((chain) => {
          if (!gone) {
            setRows(mergeActivity(chain));
            setError('');
          }
        })
        .catch(() => {
          if (!gone) setError('Could not read Arc transfers.');
        });
    };
    run();
    const id = window.setInterval(run, 20_000);
    const sync = () => setRows((current) => mergeActivity(current.filter((row) => row.status === 'confirmed')));
    window.addEventListener('dg-ledger', sync);
    return () => {
      gone = true;
      window.clearInterval(id);
      window.removeEventListener('dg-ledger', sync);
    };
  }, [account]);
  return { rows, error };
}
