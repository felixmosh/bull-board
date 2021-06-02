import ReactPaginate from 'react-paginate';
import React from 'react';
import { withRouter } from 'react-router-dom';
import { RouteComponentProps } from 'react-router';
import s from './Pagination.module.css';
import { ArrowLeftIcon } from '../Icons/ArrowLeft';
import { ArrowRightIcon } from '../Icons/ArrowRight';

interface IPaginationProps extends RouteComponentProps {
  pageCount: number;
}

class PaginationInner extends React.PureComponent<IPaginationProps> {
  constructor(props: IPaginationProps) {
    super(props);

    this.hrefBuilder = this.hrefBuilder.bind(this);
    this.handlePageChange = this.handlePageChange.bind(this);
  }

  render() {
    const { pageCount } = this.props;

    if (pageCount <= 1) {
      return null;
    }

    const {
      location: { search },
    } = this.props;
    const query = new URLSearchParams(search);

    const pageIdx = (Number(query.get('page')) || 1) - 1;

    return (
      <ReactPaginate
        forcePage={pageIdx}
        previousLabel={<ArrowLeftIcon />}
        nextLabel={<ArrowRightIcon />}
        breakLabel={'...'}
        breakClassName={s.breakMe}
        pageCount={pageCount}
        marginPagesDisplayed={2}
        pageRangeDisplayed={3}
        onPageChange={this.handlePageChange}
        containerClassName={s.pagination}
        activeClassName={s.isActive}
        disabledClassName={s.disabled}
        hrefBuilder={this.hrefBuilder}
      />
    );
  }

  private handlePageChange({ selected }: { selected: number }) {
    const {
      location: { search, pathname },
      history,
    } = this.props;

    const query = new URLSearchParams(search);
    if (selected > 0) {
      query.set('page', `${selected + 1}`);
    } else {
      query.delete('page');
    }
    query.sort();

    history.push({ pathname, search: query.toString() });
  }

  private hrefBuilder(pageIndex: number) {
    const {
      location: { search },
    } = this.props;

    const query = new URLSearchParams(search);
    if (pageIndex > 0) {
      query.set('page', `${pageIndex}`);
      query.sort();
    }
    return query.toString();
  }
}

export const Pagination = withRouter(PaginationInner);
