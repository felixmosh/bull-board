import React, { useState, useEffect } from 'react'

// do not set MINIMUM_PAGE_SIZE_ALLOWED to less than 1 to avoid divide by zero error
const MINIMUM_PAGE_SIZE_ALLOWED = 2
const MAXIMUM_PAGE_SIZE_ALLOWED = 1000

export const Paginator = ({
  pagination,
  setPagination,
  pageSize,
  setPageSize,
  totalJobs,
}) => {
  const totalPages = Math.ceil(totalJobs / pageSize)
  const currentPageNumber = totalJobs > 0 ? Math.floor(pagination.start / pageSize) + 1 : 0

  const [pageNumberInputValue, setPageNumberInputValue] = useState(currentPageNumber)
  const [pageSizeInputValue, setPageSizeInputValue] = useState(pageSize)

  useEffect(() => {
    setPageNumberInputValue(currentPageNumber)
    setPageSizeInputValue(pageSize)
  }, [currentPageNumber, pageSize])

  const handleClickPrevPage = (event) => {
    if (pagination.start >= pageSize) {
      setPagination({
        start: pagination.start - pageSize,
        end: pagination.end - pageSize,
      })
    }
  }

  const handleClickNextPage = (event) => {
    if (currentPageNumber < totalPages) {
      setPagination({
        start: pagination.start + pageSize,
        end: pagination.end + pageSize,
      })
    }
  }

  const handlePageNumberInputSubmit = (event) => {
    if (event.key !== 'Enter') {
      return
    }

    const inputValue = parseInt(pageNumberInputValue)
    if (!Number.isNaN(inputValue)) {
      if (inputValue > 0 && inputValue <= totalPages) {
        const startIndex = (inputValue - 1) * pageSize
        const endIndex = startIndex + (Math.min(Math.max(totalJobs - 1, 0), pageSize - 1))
        setPagination({
          start: (inputValue - 1) * pageSize,
          end: endIndex,
        })
      } else {
        alert(`Invalid page number. Please input a number between 1 and ${totalPages}`)
        setPageNumberInputValue(currentPageNumber)
      }
    }
  }

  const handlePageNumberInputChange = (event) => {
    setPageNumberInputValue(event.target.value)
  }

  const handlePageSizeInputSubmit = (event) => {
    if (event.key !== 'Enter') {
      return
    }

    const inputValue = parseInt(pageSizeInputValue)
    if (
      Number.isNaN(inputValue) || inputValue < MINIMUM_PAGE_SIZE_ALLOWED || inputValue > MAXIMUM_PAGE_SIZE_ALLOWED
    ) {
      alert(`Invalid page size, please input a number between ${MINIMUM_PAGE_SIZE_ALLOWED} - ${MAXIMUM_PAGE_SIZE_ALLOWED}`)
      setPageSizeInputValue(pageSize)
      return
    }

    setPageSize(inputValue)
    setPagination({
      start: 0,
      end: inputValue - 1,
    })
  }

  const handlePageSizeInputChange = (event) => {
    setPageSizeInputValue(event.target.value)
  }

  return (
    <div className="paginator">
      <div>
        <button
          disabled={pagination.start < pageSize}
          role="button"
          onClick={handleClickPrevPage}
        >
          Prev
        </button>
        
        <button
          disabled={currentPageNumber >= totalPages}
          role="button"
          onClick={handleClickNextPage}
        >
          Next
        </button>
      </div>
      <div>
        Page <input
          disabled={totalPages === 0}
          className="page-number" 
          type="number" 
          onKeyDown={handlePageNumberInputSubmit} 
          onChange={handlePageNumberInputChange} 
          value={pageNumberInputValue} /> out of {totalPages} pages,{' '}
        
        <input
          disabled={totalJobs <= 2}
          className="page-size"
          type="number"
          onKeyDown={handlePageSizeInputSubmit}
          onChange={handlePageSizeInputChange}
          value={pageSizeInputValue} /> jobs per page.
      </div>
      <div>
        Listing the first{' '}
        {pagination.start} - {Math.min(pagination.end, totalJobs)} jobs.
      </div>
    </div>
  )
}
