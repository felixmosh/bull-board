import React, { useState, useEffect } from 'react'

export const Paginator = ({
  pagination,
  setPagination,
  totalJobs,
}) => {
  const totalPages = Math.ceil(totalJobs / 10)
  const currentPageNumber = totalJobs > 0 ? Math.floor(pagination.start / 10) + 1 : 0

  const [pageNumberInputValue, setPageNumberInputValue] = useState(currentPageNumber)

  useEffect(() => {
    setPageNumberInputValue(currentPageNumber)
  }, [currentPageNumber])

  const handleClickPrevPage = (event) => {
    if (pagination.start >= 10) {
      setPagination({
        start: pagination.start - 10,
        end: pagination.end - 10,
      })
    }
  }

  const handleClickNextPage = (event) => {
    if (currentPageNumber < totalPages) {
      setPagination({
        start: pagination.start + 10,
        end: pagination.end + 10,
      })
    }
  }

  const handlePageNumberInputSubmit = (event) => {
    if (event.key !== 'Enter') {
      return
    }

    const inputValue = parseInt(pageNumberInputValue)
    if (Number.isNaN(inputValue)) {
      if (inputValue > 0 && inputValue <= totalPages) {
        const startIndex = (inputValue - 1) * 10
        const endIndex = startIndex + (Math.min(Math.max(totalJobs - 1, 0), 9))
        setPagination({
          start: (inputValue - 1) * 10,
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

  return (
    <div className="paginator">
      <div>
        <button
          disabled={pagination.start < 10}
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
          value={pageNumberInputValue} /> out of {totalPages} pages. Listing the first{' '}
        {pagination.start} - {Math.min(pagination.end, totalJobs)} jobs.
      </div>
    </div>
  )
}
