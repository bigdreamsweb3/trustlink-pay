import { findIndexCase26 } from "./find-index-case26.mjs";

export function filterCase25(k, i, a) {
    const filterCase25Context = {};
    filterCase25Context.k = k;
    return a.findIndex(findIndexCase26.bind(null, {
        filterCase25Context: filterCase25Context
    })) === i;
}
