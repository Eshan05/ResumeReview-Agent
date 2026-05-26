'use client'

import * as React from 'react'
import { Column } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='-ml-2 h-7 data-[state=open]:bg-accent'
          >
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDown className='size-3.5 text-muted-foreground/70' />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUp className='size-3.5 text-muted-foreground/70' />
            ) : (
              <ChevronsUpDown className='size-3.5 text-muted-foreground/70' />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-40 *:gap-2'>
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUp className='size-3.5 text-muted-foreground/70' />
            Ascending
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDown className='size-3.5 text-muted-foreground/70' />
            Descending
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
            <EyeOff className='size-3.5 text-muted-foreground/70' />
            Hide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

