import React from 'react'
import { PER_PAGE, Status } from '../constants'
import s from './Paginate.module.css'
import ReactPaginate from 'react-paginate'
import { scrollToTop } from '../../helpers/scroll'

interface PaginateProps {
  page: number
  count?: number
  activeStatus: Status
  onChange: (page: number) => void
}

export const Paginate = (props: PaginateProps) => {
  if (!props.count || props.activeStatus === 'latest') {
    return null
  }
  return (
    <ReactPaginate
      pageLinkClassName={s.item}
      activeLinkClassName={s.itemActive}
      previousLabel="Prev"
      nextLabel="Next"
      containerClassName={s.paginate}
      marginPagesDisplayed={3}
      pageRangeDisplayed={2}
      onPageChange={({ selected }) => {
        props.onChange(selected)
        scrollToTop()
      }}
      nextClassName={s.prevNextBtn}
      previousClassName={s.prevNextBtn}
      forcePage={props.page}
      pageCount={Math.ceil(props.count / PER_PAGE)}
    />
  )
}
