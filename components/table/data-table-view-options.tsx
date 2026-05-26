'use client'
'use no memo'

import { Table } from '@tanstack/react-table'
import { Settings2 } from 'lucide-react'
import { DropdownMenu as DDM } from 'radix-ui'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>
  idToName: Record<string, string>
  scrollHeight?: string
}

export function DataTableViewOptions<TData>({
  table,
  idToName,
  scrollHeight,
}: DataTableViewOptionsProps<TData>) {
  const columns = table
    .getAllColumns()
    .filter(
      (column) =>
        typeof column.accessorFn !== 'undefined' && column.getCanHide()
    )

  return (
    <DropdownMenu>
      <DDM.DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' className='ml-auto hidden h-7 lg:flex'>
          <Settings2 className='mr-1 size-3.5' />
          View
        </Button>
      </DDM.DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-44'>
        <ScrollArea className={scrollHeight || 'h-56'}>
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map((column) => {
            const columnName = idToName[column.id] || column.id
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className='capitalize'
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {columnName}
              </DropdownMenuCheckboxItem>
            )
          })}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

