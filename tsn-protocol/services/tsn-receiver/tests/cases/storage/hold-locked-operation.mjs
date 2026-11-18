export async function holdLockedOperation(state) { state.acquired(); await state.hold; }
