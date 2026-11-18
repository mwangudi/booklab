import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * The key that goes in a record's page address: its short link code (XR56LK) when it
 * has one, so a URL says nothing about how many records exist; otherwise its id.
 */
export const recordKey = (r: { id: number; ref?: string | null }) => r.ref ?? String(r.id);

/**
 * Once a record has loaded, move an old address (/customers/12/edit) or a lower-case
 * code to the record's own address (/customers/XR56LK/edit), keeping the query and state.
 */
export function useCanonicalAddress(param: string | undefined, record: { ref?: string | null } | null | undefined) {
  const navigate = useNavigate();
  const location = useLocation();
  const ref = record?.ref;
  useEffect(() => {
    if (!param || !ref || param === ref) return;
    const path = location.pathname.replace(`/${param}`, `/${ref}`);
    if (path !== location.pathname) navigate(path + location.search, { replace: true, state: location.state });
  }, [param, ref, location.pathname, location.search, location.state, navigate]);
}
