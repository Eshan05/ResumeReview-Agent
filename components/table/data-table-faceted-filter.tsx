'use client'
'use no memo'

import * as React from 'react'
import { Column } from '@tanstack/react-table'
import { Check, PlusCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'

interface DataTableFacetedFilterProps<TData, TValue> {
  column?: Column<TData, TValue>
  title?: string
  buttonClasses?: string
  popoverWidth?: string
  options: {
    label: string
    value: string
    count?: number
    icon?: React.ComponentType<{ className?: string }>
  }[]
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  buttonClasses,
  options,
  popoverWidth,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues()
  const selectedValues = new Set(
    Array.isArray(column?.getFilterValue())
      ? (column?.getFilterValue() as string[])
      : column?.getFilterValue()
        ? [column?.getFilterValue() as string]
        : []
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className={cn(
            'h-7 border-dashed flex items-center space-x-2',
            buttonClasses
          )}
        >
          <PlusCircle className='h-4 w-4' />
          <span>{title}</span>
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation='vertical' className='mx-1 h-4' />
              <Badge
                variant='secondary'
                className='rounded-sm px-1 font-normal lg:hidden'
              >
                {selectedValues.size}
              </Badge>
              <div className='hidden space-x-1 lg:flex'>
                {selectedValues.size > 2 ? (
                  <Badge
                    variant='secondary'
                    className='rounded-sm px-1 font-normal'
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        variant='secondary'
                        key={option.value}
                        className='rounded-sm px-1 font-normal'
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={popoverWidth ? `${popoverWidth} p-0` : 'w-50 p-0'}
        align='start'
      >
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                return (
                  <CommandItem
                    className='bg-transparent! hover:bg-secondary!'
                    key={option.value}
                    onSelect={() => {
                      if (isSelected) {
                        selectedValues.delete(option.value)
                      } else {
                        selectedValues.add(option.value)
                      }
                      const filterValues = Array.from(selectedValues)
                      column?.setFilterValue(
                        filterValues.length ? filterValues : undefined
                      )
                    }}
                  >
                    <div
                      className={cn(
                        'flex size-3! aspect-square items-center justify-center rounded-sm border border-primary',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'opacity-50 [&_svg]:invisible'
                      )}
                    >
                      <Check className='size-2.5!' />
                    </div>
                    {option.icon && (
                      <option.icon className='size-3 ml-1 -mr-0.5 text-muted-foreground' />
                    )}
                    <span className='text-xs w-full!'>{option.label}</span>
                     {(option.count ?? facets?.get(option.value)) ? (
                       <span className='ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs'>
                         {option.count ?? facets?.get(option.value)}
                       </span>
                     ) : null}
                   </CommandItem>
                 )
               })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column?.setFilterValue(undefined)}
                    className='justify-center text-center'
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

