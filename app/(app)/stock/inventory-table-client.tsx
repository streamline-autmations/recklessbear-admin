"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, AlertTriangle, ArrowUp, ArrowDown, History } from "lucide-react";
import { addMaterialAction, addStockMovementAction, updateMaterialAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { Material } from "@/types/stock";
import { Card, CardContent } from "@/components/ui/card";

interface InventoryTableClientProps {
  materials: Material[];
}

export function InventoryTableClient({ materials }: InventoryTableClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  // Stock movement state
  const [movementQty, setMovementQty] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const [movementType, setMovementType] = useState<"restocked" | "audit">("restocked");

  function handleAddMaterial(formData: FormData) {
    startTransition(async () => {
      const result = await addMaterialAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Material added");
        setIsAddOpen(false);
        router.refresh();
      }
    });
  }

  function handleEditMaterial(formData: FormData) {
    startTransition(async () => {
        const result = await updateMaterialAction(formData);
        if (result?.error) {
            toast.error(result.error);
        } else {
            toast.success("Material updated");
            setIsEditOpen(false);
            router.refresh();
        }
    });
  }

  function handleStockMovement() {
    if (!selectedMaterial) return;
    const qty = parseFloat(movementQty);
    if (isNaN(qty)) return;

    // For restock, delta is positive. For audit, we calculate delta? 
    // Or we just support "Add" (restock) and "Adjust" (audit +/-)
    // Simplified: Restock always adds. Audit can be + or -.
    // Let's assume Restock UI is just for adding.
    
    let delta = qty;
    if (movementType === "audit") {
        // If audit, user enters NEW total? Or difference?
        // Let's stick to simple "Add/Remove" logic for now or "Adjust by"
        // Let's assume input is DELTA for simplicity in MVP
        // If user wants to set exact quantity, they need to calculate delta manually or we build "Set Quantity" feature later.
        // For now, let's treat "Restock" as ADD.
    }

    const formData = new FormData();
    formData.set("materialId", selectedMaterial.id);
    formData.set("deltaQty", delta.toString());
    formData.set("type", movementType);
    formData.set("notes", movementNotes);

    startTransition(async () => {
      const result = await addStockMovementAction(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Stock updated");
        setIsRestockOpen(false);
        setMovementQty("");
        setMovementNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Input placeholder="Search materials..." className="max-w-sm" />
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Material
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Material</DialogTitle>
            </DialogHeader>
            <form action={handleAddMaterial} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="unit">Unit (e.g. m, kg)</Label>
                  <Input id="unit" name="unit" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="qty_on_hand">Initial Qty</Label>
                  <Input id="qty_on_hand" name="qty_on_hand" type="number" step="0.01" defaultValue="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="minimum_level">Min Level</Label>
                  <Input id="minimum_level" name="minimum_level" type="number" step="0.01" defaultValue="0" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="restock_threshold">Restock Threshold</Label>
                  <Input id="restock_threshold" name="restock_threshold" type="number" step="0.01" defaultValue="0" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input id="supplier" name="supplier" />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Adding..." : "Add Material"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Qty On Hand</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No materials found. Add one to get started.
                </TableCell>
              </TableRow>
            ) : (
              materials.map((material) => {
                const isLowStock = material.qty_on_hand <= material.minimum_level;
                return (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell>
                      <span className={isLowStock ? "text-destructive font-bold" : ""}>
                        {material.qty_on_hand}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{material.unit}</TableCell>
                    <TableCell>
                      {isLowStock ? (
                        <span className="inline-flex items-center text-xs text-destructive font-medium bg-destructive/10 px-2 py-1 rounded-full">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">
                          OK
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{material.supplier || "—"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedMaterial(material);
                          setIsEditOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedMaterial(material);
                          setMovementType("restocked");
                          setIsRestockOpen(true);
                        }}
                      >
                        Restock
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {materials.map((material) => {
            const isLowStock = material.qty_on_hand <= material.minimum_level;
            return (
                <Card key={material.id}>
                    <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h3 className="font-semibold">{material.name}</h3>
                                <p className="text-sm text-muted-foreground">{material.supplier}</p>
                            </div>
                            {isLowStock && (
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                            )}
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <p className="text-2xl font-bold">
                                    {material.qty_on_hand} <span className="text-sm font-normal text-muted-foreground">{material.unit}</span>
                                </p>
                                <p className="text-xs text-muted-foreground">Min: {material.minimum_level}</p>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setSelectedMaterial(material);
                                    setMovementType("restocked");
                                    setIsRestockOpen(true);
                                }}
                            >
                                Restock
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )
        })}
      </div>

      {/* Restock Dialog */}
      <Dialog open={isRestockOpen} onOpenChange={setIsRestockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock {selectedMaterial?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Quantity to Add</Label>
              <Input
                type="number"
                step="0.01"
                value={movementQty}
                onChange={(e) => setMovementQty(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Input
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRestockOpen(false)}>Cancel</Button>
            <Button onClick={handleStockMovement} disabled={isPending}>
              {isPending ? "Saving..." : "Confirm Restock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit {selectedMaterial?.name}</DialogTitle>
            </DialogHeader>
            {selectedMaterial && (
                <form action={handleEditMaterial} className="space-y-4">
                    <input type="hidden" name="id" value={selectedMaterial.id} />
                    <div className="grid gap-2">
                        <Label htmlFor="edit-name">Name</Label>
                        <Input id="edit-name" name="name" defaultValue={selectedMaterial.name} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-unit">Unit</Label>
                            <Input id="edit-unit" name="unit" defaultValue={selectedMaterial.unit} required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-supplier">Supplier</Label>
                            <Input id="edit-supplier" name="supplier" defaultValue={selectedMaterial.supplier || ""} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-min">Min Level</Label>
                            <Input id="edit-min" name="minimum_level" type="number" step="0.01" defaultValue={selectedMaterial.minimum_level} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="edit-threshold">Restock Threshold</Label>
                            <Input id="edit-threshold" name="restock_threshold" type="number" step="0.01" defaultValue={selectedMaterial.restock_threshold} />
                        </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isPending}>
                        {isPending ? "Saving..." : "Save Changes"}
                    </Button>
                </form>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
