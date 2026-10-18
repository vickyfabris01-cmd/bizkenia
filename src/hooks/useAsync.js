// src/hooks/useAsync.js — NEW FILE
//
// AIM
// Runs an async function when the page opens (or when `deps` change) and gives back
// { data, error, loading, reload }. Pages show a skeleton while `loading` is true.
// The function should return { data, error } like the api files do.
//
//   const { data, error, loading } = useAsync(() => listBusinesses({ type }), [type]);

import { useCallback, useEffect, useRef, useState } from "react";

export default function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const run = useRef(0);

  const execute = useCallback(() => {
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(fn())
      .then((res) => { if (id === run.current) setState({ data: res?.data ?? null, error: res?.error ?? null, loading: false }); })
      .catch((e) => { if (id === run.current) setState({ data: null, error: e.message || "Something went wrong", loading: false }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { execute(); return () => { run.current++; }; }, [execute]);
  return { ...state, reload: execute };
}
