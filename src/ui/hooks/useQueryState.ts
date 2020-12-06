import { useReducer } from 'react'
import { SelectedStatuses } from '../../@types/app'

type Action =
  | { type: 'page'; payload: number }
  | { type: 'status'; payload: SelectedStatuses }

const initialState = {
  selectedStatuses: {} as SelectedStatuses,
  page: 0,
}
type State = typeof initialState

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'page':
      return { ...state, page: action.payload }
    case 'status':
      return { ...state, selectedStatuses: action.payload, page: 0 }
    default:
      return state
  }
}
export const useQueryState = () => {
  const [state, dispatch] = useReducer(reducer, initialState)
  return {
    state,
    actions: {
      setSelectedStatuses: (payload: SelectedStatuses) =>
        dispatch({ type: 'status', payload }),
      setPage: (payload: number) => dispatch({ type: 'page', payload }),
    },
  }
}
