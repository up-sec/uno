"use client";
import { useCallback, useEffect, useState } from "react";
import { readTokenBalance, type TokenBalance } from "@/services/token.service";

/** Saldo de MXNDEMO de la cuenta conectada (lectura, sin firma). */
export function useTokenBalance(address: string | null) {
  const [data, setData] = useState<{ address: string; balance: TokenBalance | "error" }>();

  const refresh = useCallback(() => {
    if (!address) return;
    readTokenBalance(address).then(
      (balance) => setData({ address, balance }),
      () => setData({ address, balance: "error" }),
    );
  }, [address]);

  useEffect(refresh, [refresh]);

  // undefined mientras no sabemos (o si cambió la cuenta)
  const balance = data?.address === address ? data.balance : undefined;
  return { balance, refresh };
}
