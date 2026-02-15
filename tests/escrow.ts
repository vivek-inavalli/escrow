import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.escrow as Program<Escrow>;
  const connection = provider.connection;

  const maker = provider.wallet;
  const taker = Keypair.generate();

  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerAtaA: any;
  let makerAtaB: any;
  let takerAtaA: any;
  let takerAtaB: any;

  it("Make + Take + Refund", async () => {
    await connection.requestAirdrop(taker.publicKey, 1e9);

    mintA = await createMint(connection, maker.payer, maker.publicKey, null, 0);
    mintB = await createMint(connection, maker.payer, maker.publicKey, null, 0);

    makerAtaA = await getOrCreateAssociatedTokenAccount(
      connection,
      maker.payer,
      mintA,
      maker.publicKey,
    );
    makerAtaB = await getOrCreateAssociatedTokenAccount(
      connection,
      maker.payer,
      mintB,
      maker.publicKey,
    );
    takerAtaA = await getOrCreateAssociatedTokenAccount(
      connection,
      maker.payer,
      mintA,
      taker.publicKey,
    );
    takerAtaB = await getOrCreateAssociatedTokenAccount(
      connection,
      maker.payer,
      mintB,
      taker.publicKey,
    );

    await mintTo(
      connection,
      maker.payer,
      mintA,
      makerAtaA.address,
      maker.publicKey,
      100,
    );
    await mintTo(
      connection,
      maker.payer,
      mintB,
      takerAtaB.address,
      maker.publicKey,
      200,
    );

    let escrow = Keypair.generate();

    let [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrow.publicKey.toBuffer()],
      program.programId,
    );

    await program.methods
      .make(new anchor.BN(100), new anchor.BN(200))
      .accounts({
        maker: maker.publicKey,
        mintA,
        mintB,
        escrow: escrow.publicKey,
        vault,
        makerAtaA: makerAtaA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([escrow])
      .rpc();

    await program.methods
      .take()
      .accounts({
        taker: taker.publicKey,
        escrow: escrow.publicKey,
        maker: maker.publicKey,
        vault,
        takerAtaA: takerAtaA.address,
        takerAtaB: takerAtaB.address,
        makerAtaB: makerAtaB.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([taker])
      .rpc();

    let takerA = await getAccount(connection, takerAtaA.address);
    assert.equal(Number(takerA.amount), 100);

    escrow = Keypair.generate();

    [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrow.publicKey.toBuffer()],
      program.programId,
    );

    await mintTo(
      connection,
      maker.payer,
      mintA,
      makerAtaA.address,
      maker.publicKey,
      100,
    );

    await program.methods
      .make(new anchor.BN(100), new anchor.BN(200))
      .accounts({
        maker: maker.publicKey,
        mintA,
        mintB,
        escrow: escrow.publicKey,
        vault,
        makerAtaA: makerAtaA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([escrow])
      .rpc();

    await program.methods
      .refund()
      .accounts({
        maker: maker.publicKey,
        escrow: escrow.publicKey,
        vault,
        makerAtaA: makerAtaA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    let makerA = await getAccount(connection, makerAtaA.address);
    assert.isTrue(Number(makerA.amount) >= 100);
  });
});
