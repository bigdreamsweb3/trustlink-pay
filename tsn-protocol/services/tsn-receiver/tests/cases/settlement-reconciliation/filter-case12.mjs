import { findIndexCase } from "./find-index-case.mjs";

export function filterCase12(k, i, a) {
    const filterCase12Context = {};
    filterCase12Context.k = k;
    return a.findIndex(findIndexCase.bind(null, {
        filterCase12Context: filterCase12Context
    })) === i;
}
